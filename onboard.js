(function () {
  const $ = (id) => document.getElementById(id);
  const show = (id, on) => { $(id).hidden = !on; };
  let files = [];
  let list = [];
  let others = [];

  function friendly(err) {
    const m = (err && err.message) || '';
    if (/not allowed/i.test(m)) return 'This account is not set up for onboarding. Please tell LifeHub.';
    if (/Invalid login/i.test(m)) return 'Wrong email or password.';
    if (/fetch|network|JWT|PGRST|violates|row-level/i.test(m) || !m) return 'Something went wrong. Please check your connection and try again.';
    return m;
  }
  function waNumber(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = '234' + d.slice(1);
    else if (d.length === 10) d = '234' + d;
    return d;
  }
  function setupLink(token) {
    return new URL('dashboard.html?claim=' + token, location.href).href;
  }
  function msg(id, kind, text) {
    const e = $(id); e.hidden = false; e.className = kind === 'ok' ? 'form-ok' : 'form-error'; e.textContent = text;
  }

  async function compress(file) {
    try {
      if (file.size <= 250 * 1024 && /jpeg|jpg|webp/.test(file.type)) return file;
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const s = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch (e) { return file; }
  }

  function renderPreviews() {
    const g = $('previews'); g.innerHTML = '';
    files.forEach((f, i) => {
      const d = document.createElement('div'); d.className = 'photo-item';
      const im = document.createElement('img'); im.src = URL.createObjectURL(f); im.alt = '';
      const b = document.createElement('button'); b.type = 'button'; b.textContent = '×'; b.setAttribute('aria-label', 'Remove photo');
      b.onclick = () => { files.splice(i, 1); renderPreviews(); };
      d.append(im, b); g.append(d);
    });
  }

  async function uploadPhotos() {
    const urls = [];
    for (const f of files) {
      const safe = f.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safe}`;
      const { error } = await supabaseClient.storage.from('artisan-photos').upload(path, f, { contentType: f.type || 'image/jpeg', cacheControl: '31536000' });
      if (error) throw error;
      urls.push(supabaseClient.storage.from('artisan-photos').getPublicUrl(path).data.publicUrl);
    }
    return urls;
  }

  async function refresh() {
    const [a, b] = await Promise.all([supabaseClient.rpc('onboarder_my_artisans'), supabaseClient.rpc('onboarder_spots_left')]);
    if (a.error) throw a.error;
    list = a.data || [];
    $('stMine').textContent = list.length;
    $('stLive').textContent = list.filter((x) => x.status === 'approved').length;
    $('stSpots').textContent = b.error ? '–' : b.data;
    const o = await supabaseClient.rpc('onboarder_setup_pending');
    others = o.error ? [] : (o.data || []);
    renderList();
    renderOthers();
  }

  function renderOthers() {
    const box = $('othersBox'); box.innerHTML = '';
    if (!others.length) { box.innerHTML = '<p class="empty">Everyone has set up their password. Nice work.</p>'; return; }
    others.forEach((a) => box.append(buildRow(a)));
  }

  function renderList() {
    const box = $('listBox'); box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<p class="empty">Artisans you add will show up here.</p>'; return; }
    list.forEach((a) => box.append(buildRow(a)));
  }

  function buildRow(a) {
    {
      const row = document.createElement('div'); row.className = 'row';
      const left = document.createElement('div');
      const label = a.status === 'approved' ? ['live', 'Live'] : a.status === 'rejected' ? ['rejected', 'Not approved'] : ['pending', 'Waiting for approval'];
      const b = document.createElement('b'); b.textContent = a.full_name;
      const pill = document.createElement('span'); pill.className = 'pill ' + label[0]; pill.textContent = label[1];
      const sm = document.createElement('small'); sm.textContent = [a.trade, a.area, a.phone].filter(Boolean).join(' · ');
      left.append(b, pill, sm);
      const act = document.createElement('div'); act.className = 'actions';
      if (a.has_login) {
        const s = document.createElement('small'); s.textContent = '✓ Has set a password'; act.append(s);
      } else if (a.token) {
        const link = setupLink(a.token);
        const text = `Hello ${a.full_name.split(' ')[0]}, welcome to LifeHub! Tap this link to set your password and open your dashboard where you get customers' messages:\n${link}\n\nNext time, log in with your phone number and password at ${new URL('dashboard.html', location.href).href}`;
        const wa = document.createElement('a'); wa.className = 'btn btn-primary btn-small'; wa.target = '_blank'; wa.rel = 'noopener';
        wa.href = 'https://wa.me/' + waNumber(a.phone) + '?text=' + encodeURIComponent(text); wa.textContent = 'Send on WhatsApp';
        const cp = document.createElement('button'); cp.className = 'btn btn-small'; cp.type = 'button'; cp.textContent = 'Copy link';
        cp.onclick = async () => { try { await navigator.clipboard.writeText(link); cp.textContent = 'Copied ✓'; } catch (e) { prompt('Copy this link:', link); } };
        act.append(wa, cp);
      }
      row.append(left, act); return row;
    }
  }

  function setTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    show('tabAdd', name === 'add'); show('tabList', name === 'list'); show('tabOthers', name === 'others');
  }

  async function enter(user) {
    show('viewLoading', true); show('viewLogin', false); show('viewApp', false);
    try {
      await refresh();
    } catch (err) {
      await supabaseClient.auth.signOut();
      show('viewLoading', false); show('viewLogin', true);
      msg('loginError', 'err', friendly(err));
      return;
    }
    show('viewLoading', false); show('viewApp', true);
  }

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('loginError').hidden = true;
    const email = $('loginEmail').value.trim(); const password = $('loginPassword').value;
    if (!email || !password) { msg('loginError', 'err', 'Please enter your email and password.'); return; }
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { msg('loginError', 'err', friendly(error)); return; }
    enter(data.user);
  });

  $('logoutBtn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    show('viewApp', false); show('viewLogin', true);
  });

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));
  $('fTrade').addEventListener('change', () => { show('otherWrap', $('fTrade').value === '__other'); });
  $('fPhotos').addEventListener('change', async (e) => {
    const picked = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    for (const f of picked) { if (files.length < 8) files.push(await compress(f)); }
    e.target.value = ''; renderPreviews();
  });

  $('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('addMsg').hidden = true;
    const trade = $('fTrade').value === '__other' ? $('fOther').value.trim() : $('fTrade').value;
    const f = { name: $('fName').value.trim(), phone: $('fPhone').value.trim(), area: $('fArea').value.trim(), years: $('fYears').value, bio: $('fBio').value.trim() };
    if (!f.name || !f.phone || !trade || !f.area || !f.bio) { msg('addMsg', 'err', 'Please fill in the name, phone, trade, area and description.'); return; }
    if (files.length && files.length < 3 && !confirm('Only ' + files.length + ' photo(s). Profiles with 3 or more get more customers. Add anyway?')) return;
    if (!files.length && !confirm('No photos added. Add anyway?')) return;
    const btn = $('addBtn'); btn.disabled = true; btn.textContent = 'Adding…';
    try {
      const urls = files.length ? await uploadPhotos() : [];
      const { error } = await supabaseClient.rpc('onboarder_add_artisan', { p_name: f.name, p_phone: f.phone, p_trade: trade, p_area: f.area, p_years: f.years || null, p_bio: f.bio, p_photos: urls });
      if (error) throw error;
      $('addForm').reset(); files = []; renderPreviews(); show('otherWrap', false);
      await refresh();
      msg('addMsg', 'ok', f.name + ' was added. Open "My artisans" to send them their setup link.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      msg('addMsg', 'err', friendly(err));
    }
    btn.disabled = false; btn.textContent = 'Add artisan';
  });

  (async function init() {
    try {
      const { data } = await supabaseClient.auth.getSession();
      if (data && data.session) return enter(data.session.user);
    } catch (e) {}
    show('viewLoading', false); show('viewLogin', true);
  })();
})();
