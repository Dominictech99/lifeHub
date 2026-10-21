(function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const claimToken = params.get('claim');
  const BASE_TITLE = 'Artisan dashboard — LifeHub';

  let artisan = null;
  let convs = [];
  let activeConvId = null;
  let lastMsgId = 0;
  let knownUnread = null;
  let pollTimer = null;
  let channel = null;
  let photos = [];

  // ---------- helpers ----------
  function waNumber(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = '234' + d.slice(1);
    else if (d.length === 10) d = '234' + d;
    return d;
  }
  // artisans log in with their phone number; behind the scenes it becomes a private sign-in name
  function authEmail(phone) {
    const base = String(window.LIFEHUB_AUTH_BASE || '');
    const m = base.match(/^([^@+\s]+)@([^@\s]+\.[^@\s]+)$/);
    if (!m || /YOUR_LIFEHUB_GMAIL/i.test(base)) {
      throw new Error('Login setup is not finished. Please tell LifeHub.');
    }
    return m[1] + '+p' + waNumber(phone) + '@' + m[2];
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function show(id) {
    ['viewLoading', 'viewLogin', 'viewClaim', 'viewApp'].forEach((v) => { $(v).hidden = v !== id; });
  }
  function showError(id, msg) {
    const box = $(id);
    box.textContent = msg;
    box.hidden = !msg;
  }
  function friendly(err) {
    const m = (err && err.message) || String(err || '');
    if (/Invalid login credentials/i.test(m)) return 'Wrong phone number or password.';
    if (/already registered|already been registered/i.test(m)) return 'This phone number already has an account. Log in instead.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Network problem. Please check your data or Wi-Fi and try again.';
    if (/email.*confirm|not confirmed/i.test(m)) return 'Account setup is not finished yet. Please tell LifeHub.';
    return m || 'Something went wrong. Please try again.';
  }
  function fmtTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }
  function chatsVisible() {
    return !$('tab-chats').hidden && !document.hidden;
  }
  function setTitle(n) {
    document.title = n > 0 ? `(${n}) ${BASE_TITLE}` : BASE_TITLE;
  }

  // ---------- start ----------
  async function init() {
    const { data } = await supabaseClient.auth.getSession();
    if (data && data.session) {
      const ok = await loadArtisan();
      if (ok) return openApp();
      if (claimToken) return openClaim();
      showError('loginError', 'This account is not linked to an artisan profile.');
      return show('viewLogin');
    }
    if (claimToken) return openClaim();
    show('viewLogin');
  }

  async function loadArtisan() {
    const { data: s } = await supabaseClient.auth.getSession();
    if (!s || !s.session) return false;
    const { data, error } = await supabaseClient
      .from('artisans').select('*').eq('user_id', s.session.user.id).maybeSingle();
    if (error || !data) return false;
    artisan = data;
    return true;
  }

  // ---------- log in ----------
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('loginError', '');
    const phone = $('loginPhone').value.trim();
    const password = $('loginPassword').value;
    if (waNumber(phone).length < 10 || !password) return showError('loginError', 'Enter your phone number and password.');
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Logging in…';
    try {
      const { error } = await supabaseClient.auth.signInWithPassword({ email: authEmail(phone), password });
      if (error) throw error;
      if (!(await loadArtisan())) {
        await supabaseClient.auth.signOut();
        throw new Error('This account is not linked to an artisan profile. Please tell LifeHub.');
      }
      openApp();
    } catch (err) {
      showError('loginError', friendly(err));
    } finally {
      btn.disabled = false; btn.textContent = 'Log in';
    }
  });

  // ---------- first-time setup from private link ----------
  let claimPhone = '';
  async function openClaim() {
    show('viewLoading');
    const { data, error } = await supabaseClient.rpc('get_claim_info', { p_token: claimToken });
    if (error || !data || !data.length) {
      showError('loginError', 'This setup link has already been used or is not valid. If you already set a password, log in below.');
      return show('viewLogin');
    }
    claimPhone = data[0].phone;
    $('claimIntro').textContent = `Hello ${String(data[0].full_name || '').split(' ')[0]}, create a password to open your LifeHub dashboard.`;
    $('claimPhone').textContent = 'Your login: ' + claimPhone;
    $('claimPhone').hidden = false;
    show('viewClaim');
  }

  $('claimForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('claimError', '');
    const p1 = $('claimPassword').value;
    const p2 = $('claimPassword2').value;
    if (p1.length < 8) return showError('claimError', 'Your password must be at least 8 characters.');
    if (p1 !== p2) return showError('claimError', 'The two passwords are not the same.');
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Please wait…';
    try {
      const email = authEmail(claimPhone);
      let { data, error } = await supabaseClient.auth.signUp({ email, password: p1 });
      if (error && /already registered|already been registered/i.test(error.message)) {
        // they started setup before: sign in with the same password instead
        ({ data, error } = await supabaseClient.auth.signInWithPassword({ email, password: p1 }));
        if (error) throw new Error('You already started setup with a different password. Use that password, or ask LifeHub to reset it.');
      } else if (error) {
        throw error;
      }
      if (!data.session) throw new Error('Account setup is not finished yet. Please tell LifeHub.');

      const { error: claimErr } = await supabaseClient.rpc('claim_artisan', { p_token: claimToken });
      if (claimErr) throw claimErr;

      history.replaceState(null, '', location.pathname);
      if (!(await loadArtisan())) throw new Error('Could not open your profile. Please log in.');
      openApp();
    } catch (err) {
      showError('claimError', friendly(err));
    } finally {
      btn.disabled = false; btn.textContent = 'Create password and open dashboard';
    }
  });

  // ---------- dashboard ----------
  function openApp() {
    show('viewApp');
    renderHeader();
    renderAvailability();
    renderProfileForm();
    setupAlertsUi();
    loadStats();
    loadConversations(true);
    subscribe();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => { if (!document.hidden) refreshChats(); }, 8000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshChats(); });
  }

  function renderHeader() {
    const first = String(artisan.full_name || '').split(' ')[0];
    $('hello').textContent = 'Hello, ' + first;
    const pill = $('statusPill');
    const map = { approved: ['Live', 'live'], pending: ['Waiting for review', 'pending'], rejected: ['Not approved', 'rejected'] };
    const [label, cls] = map[artisan.status] || ['', ''];
    pill.textContent = label; pill.className = 'pill ' + cls;
    let meta = `${artisan.trade || ''} · ${artisan.area || ''}`;
    if (artisan.founding_number) meta += ` · Founding Artisan #${artisan.founding_number}`;
    $('metaLine').textContent = meta;
    $('nameTrade').textContent = `${artisan.full_name} · ${artisan.trade}`;

    const b = $('statusBanner');
    if (artisan.status === 'pending') {
      b.className = 'banner pending';
      b.textContent = 'Your profile is waiting for review. Customers can see it and chat with you once it is approved. Meanwhile, make sure you have 3 or more photos in "My profile".';
      b.hidden = false;
    } else if (artisan.status === 'rejected') {
      b.className = 'banner rejected';
      b.textContent = 'Your listing was not approved. Please contact LifeHub to find out why.';
      b.hidden = false;
    } else {
      b.hidden = true;
    }
    const link = `${location.origin}/artisan.html?id=${encodeURIComponent(artisan.id)}`;
    $('publicLink').href = link;
    $('publicLink').textContent = link;
  }

  $('logoutBtn').addEventListener('click', async () => {
    if (pollTimer) clearInterval(pollTimer);
    if (channel) { supabaseClient.removeChannel(channel); channel = null; }
    await supabaseClient.auth.signOut();
    location.href = 'dashboard.html';
  });

  // tabs
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
    ['chats', 'overview', 'profile'].forEach((n) => { $('tab-' + n).hidden = n !== t.dataset.tab; });
    if (t.dataset.tab === 'chats' && artisan) refreshChats();
  }));

  // ---------- availability ----------
  function isAvailable() {
    return !!artisan.available_until && new Date(artisan.available_until).getTime() > Date.now();
  }
  function renderAvailability() {
    const live = artisan.status === 'approved';
    const on = isAvailable();
    const btn = $('availBtn');
    btn.disabled = !live;
    if (!live) {
      $('availTitle').textContent = 'Available now starts once you are approved';
      $('availSub').textContent = 'We will review your profile soon.';
      btn.textContent = "I'm available now";
      btn.className = 'btn btn-on';
      return;
    }
    if (on) {
      const t = new Date(artisan.available_until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      $('availTitle').textContent = `You are showing as available until ${t}`;
      $('availSub').textContent = 'Customers see a green "Available now" badge and you appear first. It switches off by itself.';
      btn.textContent = "I'm not available";
      btn.className = 'btn btn-off';
    } else {
      $('availTitle').textContent = 'You are not showing as available';
      $('availSub').textContent = 'Tap the button when you are free to take jobs. You will show first to customers for 4 hours.';
      btn.textContent = "I'm available now";
      btn.className = 'btn btn-on';
    }
  }
  $('availBtn').addEventListener('click', async () => {
    const btn = $('availBtn');
    btn.disabled = true;
    const turnOn = !isAvailable();
    const { data, error } = await supabaseClient.rpc('set_my_availability', { p_available: turnOn, p_hours: 4 });
    if (error) alert(friendly(error));
    else artisan.available_until = data;
    renderAvailability();
  });

  // ---------- stats ----------
  async function loadStats() {
    const { data } = await supabaseClient.rpc('my_stats');
    if (!data) return;
    $('stContacts7').textContent = data.contacts_7d ?? 0;
    $('stChats7').textContent = data.chats_7d ?? 0;
    $('stContactsAll').textContent = data.contacts_total ?? 0;
    $('stChatsAll').textContent = data.chats_total ?? 0;
  }
  $('copyLink').addEventListener('click', async () => {
    const link = $('publicLink').href;
    try { await navigator.clipboard.writeText(link); $('copyLink').textContent = 'Copied ✓'; }
    catch (e) { prompt('Copy your link:', link); }
    setTimeout(() => { $('copyLink').textContent = 'Copy my link'; }, 2000);
  });

  // ---------- alerts ----------
  function setupAlertsUi() {
    const btn = $('alertBtn');
    if (!('Notification' in window)) {
      $('alertTip').textContent = 'This browser cannot show pop-up alerts. Check your dashboard often, or add LifeHub to your home screen.';
      btn.hidden = true;
      return;
    }
    if (Notification.permission === 'granted') {
      $('alertTip').textContent = 'Alerts are on. You will see a pop-up when a customer messages you while LifeHub is open.';
      btn.hidden = true;
    } else if (Notification.permission === 'denied') {
      $('alertTip').textContent = 'Alerts are blocked in your browser settings for this site.';
      btn.hidden = true;
    }
  }
  $('alertBtn').addEventListener('click', async () => {
    try { await Notification.requestPermission(); } catch (e) {}
    setupAlertsUi();
  });
  function notify(title, body) {
    try {
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        new Notification(title, { body, icon: 'icons/icon-192.png' });
      }
    } catch (e) {}
  }

  // ---------- chats ----------
  function subscribe() {
    if (channel) return;
    try {
      channel = supabaseClient
        .channel('artisan-messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => refreshChats())
        .subscribe();
    } catch (e) { /* polling still works */ }
  }

  async function refreshChats() {
    await loadConversations(false);
    if (activeConvId) await loadThread(activeConvId, false);
  }

  let lastPreview = {};
  async function loadConversations(first) {
    const { data, error } = await supabaseClient
      .from('conversations')
      .select('id, client_name, created_at, last_message_at, artisan_unread')
      .order('last_message_at', { ascending: false });
    if (error) return;
    convs = data || [];

    if (convs.length) {
      const ids = convs.map((c) => c.id);
      const { data: ms } = await supabaseClient
        .from('messages')
        .select('conversation_id, sender, body, id')
        .in('conversation_id', ids)
        .order('id', { ascending: false })
        .limit(150);
      lastPreview = {};
      (ms || []).forEach((m) => { if (!lastPreview[m.conversation_id]) lastPreview[m.conversation_id] = m; });
    }

    const unread = convs.reduce((n, c) => n + (c.id === activeConvId && chatsVisible() ? 0 : c.artisan_unread), 0);
    if (knownUnread !== null && unread > knownUnread) {
      const newest = convs.find((c) => c.artisan_unread > 0);
      if (newest) {
        const p = lastPreview[newest.id];
        notify('New message on LifeHub', `${newest.client_name}: ${p ? p.body : ''}`);
      }
    }
    knownUnread = unread;
    const badge = $('chatBadge');
    badge.textContent = unread; badge.hidden = unread === 0;
    setTitle(unread);
    renderConvList();
  }

  function renderConvList() {
    const list = $('convList');
    list.textContent = '';
    if (!convs.length) {
      const e = el('div', 'empty');
      e.textContent = artisan.status === 'approved'
        ? 'No chats yet. When a customer messages you, it will show here. Share your page link to get more.'
        : 'Chats will appear here once your profile is approved.';
      list.appendChild(e);
      $('chatLayout').classList.remove('in-thread');
      $('thread').style.display = 'none';
      return;
    }
    $('thread').style.display = '';
    convs.forEach((c) => {
      const b = el('button', 'conv' + (c.artisan_unread > 0 ? ' unread' : '') + (c.id === activeConvId ? ' active' : ''));
      b.type = 'button';
      const top = el('div', 'top');
      top.appendChild(el('b', '', c.client_name));
      top.appendChild(el('span', 'time', fmtTime(c.last_message_at)));
      b.appendChild(top);
      const p = lastPreview[c.id];
      b.appendChild(el('div', 'prev', p ? (p.sender === 'artisan' ? 'You: ' : '') + p.body : ''));
      b.addEventListener('click', () => openThread(c.id));
      list.appendChild(b);
    });
    if (!activeConvId && window.innerWidth > 760 && chatsVisible()) openThread(convs[0].id);
    else if (!activeConvId) $('thread').style.display = 'none';
  }

  async function openThread(id) {
    activeConvId = id;
    lastMsgId = 0;
    $('msgs').textContent = '';
    $('chatLayout').classList.add('in-thread');
    $('thread').style.display = '';
    const c = convs.find((x) => x.id === id);
    $('threadTitle').textContent = c ? c.client_name : 'Chat';
    await loadThread(id, true);
    renderConvList();
  }

  $('threadBack').addEventListener('click', () => {
    activeConvId = null;
    $('chatLayout').classList.remove('in-thread');
    renderConvList();
  });

  async function loadThread(id, scroll) {
    const { data, error } = await supabaseClient
      .from('messages')
      .select('id, sender, body, created_at')
      .eq('conversation_id', id)
      .gt('id', lastMsgId)
      .order('id', { ascending: true });
    if (error || id !== activeConvId) return;
    const box = $('msgs');
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    (data || []).forEach((m) => {
      const b = el('div', 'bubble ' + m.sender);
      b.appendChild(document.createTextNode(m.body));
      b.appendChild(el('small', '', fmtTime(m.created_at)));
      box.appendChild(b);
      lastMsgId = m.id;
    });
    if (scroll || nearBottom) box.scrollTop = box.scrollHeight;
    const c = convs.find((x) => x.id === id);
    if (c && c.artisan_unread > 0 && chatsVisible()) {
      c.artisan_unread = 0;
      await supabaseClient.rpc('artisan_mark_read', { p_conversation_id: id });
      knownUnread = convs.reduce((n, x) => n + x.artisan_unread, 0);
      $('chatBadge').textContent = knownUnread; $('chatBadge').hidden = knownUnread === 0;
      setTitle(knownUnread);
      renderConvList();
    }
  }

  $('composer').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ta = $('composerText');
    const text = ta.value.trim();
    if (!text || !activeConvId) return;
    const btn = $('sendBtn');
    btn.disabled = true;
    const { error } = await supabaseClient.rpc('artisan_send', { p_conversation_id: activeConvId, p_body: text });
    btn.disabled = false;
    if (error) return alert(friendly(error));
    ta.value = '';
    await loadThread(activeConvId, true);
    loadConversations(false);
  });
  $('composerText').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 760) {
      e.preventDefault();
      $('composer').requestSubmit();
    }
  });

  // ---------- profile ----------
  function renderProfileForm() {
    $('pfArea').value = artisan.area || '';
    $('pfBio').value = artisan.bio || '';
    const sel = $('pfYears');
    if (![...sel.options].some((o) => o.value === artisan.years_experience || o.text === artisan.years_experience)) {
      const o = document.createElement('option'); o.textContent = artisan.years_experience || ''; sel.insertBefore(o, sel.firstChild);
    }
    sel.value = artisan.years_experience;
    photos = Array.isArray(artisan.photo_urls) ? artisan.photo_urls.slice() : [];
    renderPhotos();
  }
  function renderPhotos() {
    const g = $('photoGrid');
    g.textContent = '';
    photos.forEach((url, i) => {
      const d = el('div', 'photo-item');
      const img = document.createElement('img'); img.src = url; img.alt = ''; img.loading = 'lazy';
      const x = el('button', '', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove photo');
      x.addEventListener('click', () => { photos.splice(i, 1); renderPhotos(); });
      d.appendChild(img); d.appendChild(x); g.appendChild(d);
    });
    $('addPhotoBtn').hidden = photos.length >= 8;
  }

  async function compressImage(file) {
    try {
      if (file.size <= 250 * 1024 && /jpeg|jpg|webp/.test(file.type)) return file;
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch (e) { return file; }
  }

  $('addPhotoBtn').addEventListener('click', () => $('photoInput').click());
  $('photoInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files).filter((f) => f.type.startsWith('image/'));
    e.target.value = '';
    const btn = $('addPhotoBtn');
    for (const f of files) {
      if (photos.length >= 8) break;
      btn.disabled = true; btn.textContent = 'Uploading…';
      try {
        const file = await compressImage(f);
        const safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safe}`;
        const { error } = await supabaseClient.storage.from('artisan-photos')
          .upload(path, file, { contentType: file.type || 'image/jpeg', cacheControl: '31536000' });
        if (error) throw error;
        photos.push(supabaseClient.storage.from('artisan-photos').getPublicUrl(path).data.publicUrl);
        renderPhotos();
      } catch (err) {
        alert('Could not upload a photo: ' + friendly(err));
      }
    }
    btn.disabled = false; btn.textContent = 'Add photos';
  });

  $('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('profileMsg');
    msg.hidden = true;
    const btn = $('saveProfile');
    btn.disabled = true; btn.textContent = 'Saving…';
    const { error } = await supabaseClient.rpc('update_my_profile', {
      p_bio: $('pfBio').value, p_area: $('pfArea').value, p_years: $('pfYears').value, p_photo_urls: photos,
    });
    btn.disabled = false; btn.textContent = 'Save changes';
    msg.hidden = false;
    if (error) { msg.className = 'form-error'; msg.textContent = friendly(error); return; }
    msg.className = 'form-ok'; msg.textContent = 'Saved. Your public page is updated.';
    artisan.bio = $('pfBio').value.trim(); artisan.area = $('pfArea').value.trim(); artisan.years_experience = $('pfYears').value;
    artisan.photo_urls = photos.slice();
    renderHeader();
  });

  init();
})();