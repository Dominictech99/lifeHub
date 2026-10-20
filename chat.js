/* LifeHub client chat: lets a customer message an artisan without creating an account.
 * The chat is remembered on the customer's phone with a private code, so they can come back to it.
 */
(function () {
  const STORE_KEY = 'lifehub-chats';
  const NAME_KEY = 'lifehub-chat-name';
  const POLL_MS = 4000;

  let overlay = null;
  let current = null;       // { artisanId, artisanName }
  let token = null;
  let lastId = 0;
  let timer = null;
  let busy = false;

  // ---- storage (works even if the browser blocks it) ----
  function readChats() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveToken(artisanId, t) {
    try {
      const all = readChats();
      if (t) all[artisanId] = t; else delete all[artisanId];
      localStorage.setItem(STORE_KEY, JSON.stringify(all));
    } catch (e) {}
  }
  function savedName() {
    try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; }
  }
  function saveName(n) {
    try { localStorage.setItem(NAME_KEY, n); } catch (e) {}
  }

  // ---- tiny DOM helper ----
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function friendly(err) {
    const m = (err && err.message) || '';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Network problem. Please check your data or Wi-Fi and try again.';
    return m || 'Something went wrong. Please try again.';
  }
  function fmtTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    return d.toDateString() === now.toDateString()
      ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  // ---- panel ----
  function build() {
    overlay = el('div', 'lhc-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const panel = el('div', 'lhc-panel');

    const head = el('div', 'lhc-head');
    const titles = el('div', 'lhc-titles');
    titles.appendChild(el('div', 'lhc-title'));
    titles.appendChild(el('div', 'lhc-sub'));
    const close = el('button', 'lhc-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close chat');
    close.addEventListener('click', closeChat);
    head.appendChild(titles);
    head.appendChild(close);

    const body = el('div', 'lhc-body');
    const foot = el('div', 'lhc-foot');

    panel.appendChild(head);
    panel.appendChild(body);
    panel.appendChild(foot);
    overlay.appendChild(panel);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeChat(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
  }
  function onKey(e) { if (e.key === 'Escape') closeChat(); }
  function q(sel) { return overlay.querySelector(sel); }

  function closeChat() {
    if (timer) { clearInterval(timer); timer = null; }
    document.removeEventListener('keydown', onKey);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    document.body.style.overflow = '';
  }

  function setHeader(sub) {
    q('.lhc-title').textContent = 'Chat with ' + current.artisanName;
    q('.lhc-sub').textContent = sub || '';
  }

  // ---- start form ----
  function showStartForm() {
    token = null;
    setHeader('Send a message. They will reply here.');
    const body = q('.lhc-body');
    const foot = q('.lhc-foot');
    body.textContent = '';
    foot.textContent = '';

    const form = el('form', 'lhc-start');
    form.noValidate = true;

    const l1 = el('label', '', 'Your name');
    l1.setAttribute('for', 'lhcName');
    const name = el('input'); name.type = 'text'; name.id = 'lhcName'; name.maxLength = 60;
    name.placeholder = 'e.g. Chidi'; name.autocomplete = 'given-name'; name.value = savedName();

    const l2 = el('label', '', 'What do you need?');
    l2.setAttribute('for', 'lhcMsg');
    const msg = el('textarea'); msg.id = 'lhcMsg'; msg.maxLength = 1000; msg.rows = 4;
    msg.placeholder = 'Tell them the job, your area, and when you need it.';

    const err = el('div', 'lhc-error'); err.hidden = true;
    const btn = el('button', 'btn btn-primary lhc-send', 'Send message'); btn.type = 'submit';
    const tip = el('p', 'lhc-tip', 'Agree the price before work starts, and pay when you are satisfied. Never share your bank PIN or card details.');

    [l1, name, l2, msg, err, btn, tip].forEach((n) => form.appendChild(n));
    body.appendChild(form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      const n = name.value.trim();
      const m = msg.value.trim();
      if (!n) { err.textContent = 'Please enter your name.'; err.hidden = false; return; }
      if (!m) { err.textContent = 'Please write a message.'; err.hidden = false; return; }
      btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const { data, error } = await supabaseClient.rpc('start_chat', { p_artisan_id: current.artisanId, p_name: n, p_body: m });
        if (error) throw error;
        saveName(n);
        saveToken(current.artisanId, data);
        token = data;
        lastId = 0;
        showThread();
      } catch (ex) {
        err.textContent = friendly(ex); err.hidden = false;
        btn.disabled = false; btn.textContent = 'Send message';
      }
    });
    setTimeout(() => (name.value ? msg : name).focus(), 50);
  }

  // ---- thread ----
  function showThread() {
    setHeader('Replies show here. Check back later if they are busy.');
    const body = q('.lhc-body');
    const foot = q('.lhc-foot');
    body.textContent = '';
    foot.textContent = '';
    body.appendChild(el('div', 'lhc-msgs'));

    const form = el('form', 'lhc-compose');
    const ta = el('textarea'); ta.maxLength = 1000; ta.rows = 1; ta.placeholder = 'Write a message…';
    ta.setAttribute('aria-label', 'Message');
    const send = el('button', 'btn btn-primary', 'Send'); send.type = 'submit';
    form.appendChild(ta); form.appendChild(send);
    foot.appendChild(form);
    const err = el('div', 'lhc-error'); err.hidden = true;
    foot.appendChild(err);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = ta.value.trim();
      if (!text) return;
      send.disabled = true; err.hidden = true;
      try {
        const { error } = await supabaseClient.rpc('client_send', { p_token: token, p_body: text });
        if (error) throw error;
        ta.value = '';
        await poll(true);
      } catch (ex) {
        err.textContent = friendly(ex); err.hidden = false;
      }
      send.disabled = false;
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 640) { e.preventDefault(); form.requestSubmit(); }
    });

    poll(true);
    if (timer) clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) poll(false); }, POLL_MS);
  }

  async function poll(scroll) {
    if (busy || !overlay || !token) return;
    busy = true;
    try {
      const { data, error } = await supabaseClient.rpc('client_chat', { p_token: token, p_after: lastId });
      if (error) throw error;
      if (!overlay) return;
      if (!data) {            // chat no longer exists
        saveToken(current.artisanId, null);
        showStartForm();
        return;
      }
      const box = q('.lhc-msgs');
      if (!box) return;
      const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      (data.messages || []).forEach((m) => {
        const b = el('div', 'lhc-bubble ' + (m.sender === 'client' ? 'mine' : 'theirs'));
        b.appendChild(document.createTextNode(m.body));
        b.appendChild(el('small', '', fmtTime(m.created_at)));
        box.appendChild(b);
        lastId = m.id;
      });
      if (data.artisan_name) q('.lhc-title').textContent = 'Chat with ' + data.artisan_name;
      q('.lhc-sub').textContent = data.artisan_available
        ? '● Available now'
        : 'Replies show here. Check back later if they are busy.';
      if (scroll || nearBottom) box.scrollTop = box.scrollHeight;
    } catch (e) {
      /* keep quiet while polling; the next try may work */
    } finally {
      busy = false;
    }
  }

  // ---- public ----
  function open(opts) {
    if (!opts || !opts.artisanId) return;
    if (typeof supabaseClient === 'undefined') { alert('Chat is not available right now.'); return; }
    if (overlay) closeChat();
    current = { artisanId: opts.artisanId, artisanName: opts.artisanName || 'this artisan' };
    lastId = 0;
    build();
    token = readChats()[current.artisanId] || null;
    if (token) { showThread(); } else { showStartForm(); }
  }

  window.LifeHubChat = { open: open };
})();
