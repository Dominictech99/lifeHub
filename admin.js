(function () {
  const loginView = document.getElementById('loginView');
  const dashboardView = document.getElementById('dashboardView');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const signOutBtn = document.getElementById('signOutBtn');

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---------- AUTH ----------

  async function isAdminUser() {
    const { data, error } = await supabaseClient.rpc('is_admin');
    return !error && data === true;
  }

  async function checkSession() {
    const { data } = await supabaseClient.auth.getSession();
    if (data.session && (await isAdminUser())) {
      showDashboard();
    } else {
      if (data.session) await supabaseClient.auth.signOut();
      showLogin();
    }
  }

  function showLogin() {
    loginView.style.display = 'flex';
    dashboardView.style.display = 'none';
  }

  function showDashboard() {
    loginView.style.display = 'none';
    dashboardView.style.display = 'block';
    loadArtisans();
    loadMessages();
    loadReviews();
    loadLeads();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      loginError.textContent = 'Sign-in failed — check your email and password.';
      loginError.style.display = 'block';
      return;
    }

    if (!(await isAdminUser())) {
      await supabaseClient.auth.signOut();
      loginError.textContent = 'This account is not an admin.';
      loginError.style.display = 'block';
      return;
    }

    showDashboard();
  });

  signOutBtn.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    showLogin();
  });

  // ---------- TOP-LEVEL TABS ----------

  const topTabs = document.getElementById('adminTopTabs');
  topTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.admin-top-tab');
    if (!tab) return;
    topTabs.querySelectorAll('.admin-top-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');

    const panel = tab.dataset.panel;
    ['artisans', 'messages', 'reviews', 'stats', 'leads'].forEach((p) => {
      document.getElementById(`panel-${p}`).style.display = p === panel ? 'block' : 'none';
    });
    if (panel === 'stats') loadStats();
  });


  // ================= STATS =================
  async function loadStats() {
    const box = document.getElementById('statsBox');
    const { data, error } = await supabaseClient.rpc('admin_stats');
    if (error) {
      box.innerHTML = `<p style="color:#B4232C;">Couldn't load stats: ${escapeHtml(error.message)}<br>Did you run stats_and_booking.sql?</p>`;
      return;
    }
    const t = data.totals, w = data.last7;
    const card = (n, label, sub) => `<div style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px;text-align:center;"><div style="font:700 26px 'Space Grotesk',sans-serif;color:var(--ink);">${n}</div><div style="font-size:13px;color:var(--text-mute);">${label}</div>${sub ? `<div style="font-size:12px;color:var(--leaf);margin-top:2px;">${sub}</div>` : ''}</div>`;
    const grid = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:22px;';
    const rate = t.chats ? Math.round((t.booked / t.chats) * 100) + '% of chats' : '';
    let html = `<h3 style="margin:0 0 10px;">Artisans</h3><div style="${grid}">
      ${card(t.artisans, 'Total artisans')}${card(t.approved, 'Live on the site')}${card(t.pending, 'Waiting for approval')}${card(t.with_login, 'Have a dashboard login')}</div>
      <h3 style="margin:0 0 10px;">Clients</h3><div style="${grid}">
      ${card(t.chats, 'Clients who chatted', '+' + w.chats + ' this week')}${card(t.booked, 'Booked', rate + (w.booked ? ' · +' + w.booked + ' this week' : ''))}
      ${card(t.replies, 'Artisan replies')}${card(t.client_msgs, 'Client messages')}${card(t.leads, 'WhatsApp / contact taps', '+' + w.leads + ' this week')}${card(t.reviews, 'Approved reviews')}</div>
      <p style="font-size:13px;color:var(--text-mute);margin:-8px 0 22px;">“Booked” counts chats an artisan marked as booked in their dashboard. Clients who go straight to WhatsApp cannot be tracked as booked.</p>`;
    const th = 'text-align:left;padding:8px 10px;font-size:12.5px;color:var(--text-mute);border-bottom:1px solid var(--line);white-space:nowrap;';
    const td = 'padding:10px;font-size:14px;border-bottom:1px solid var(--line);';
    html += `<h3 style="margin:0 0 10px;">Per artisan</h3><div style="overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:12px;margin-bottom:22px;"><table style="width:100%;border-collapse:collapse;min-width:560px;"><tr>
      <th style="${th}">Artisan</th><th style="${th}">Chats</th><th style="${th}">Replies</th><th style="${th}">Booked</th><th style="${th}">Taps</th><th style="${th}">Reviews</th></tr>`;
    (data.artisans || []).forEach((a) => {
      const flag = a.chats > 0 && a.replies === 0 ? ' <span style="color:#B4232C;font-size:12px;">no reply yet</span>' : '';
      html += `<tr><td style="${td}"><b>${escapeHtml(a.full_name)}</b><br><span style="font-size:12.5px;color:var(--text-mute);">${escapeHtml(a.trade || '')} · ${a.status === 'approved' ? 'live' : escapeHtml(a.status)}${a.has_login ? '' : ' · no login yet'}</span></td>
        <td style="${td}">${a.chats}${flag}</td><td style="${td}">${a.replies}</td><td style="${td}">${a.booked}</td><td style="${td}">${a.leads}</td><td style="${td}">${a.reviews}</td></tr>`;
    });
    html += `</table></div>`;
    if ((data.onboarders || []).length) {
      html += `<h3 style="margin:0 0 10px;">Onboarders</h3><div style="overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:12px;"><table style="width:100%;border-collapse:collapse;"><tr><th style="${th}">Name</th><th style="${th}">Artisans added</th><th style="${th}">Approved</th></tr>`;
      data.onboarders.forEach((o) => { html += `<tr><td style="${td}"><b>${escapeHtml(o.name || '—')}</b></td><td style="${td}">${o.added}</td><td style="${td}">${o.approved}</td></tr>`; });
      html += `</table></div>`;
    }
    box.innerHTML = html;
  }

  // ================= ARTISANS =================

  let allArtisans = [];
  let activeArtisanStatus = 'pending';
  const statusTabs = document.getElementById('statusTabs');
  const adminList = document.getElementById('adminList');

  async function loadArtisans() {
    adminList.innerHTML = `<p style="color:var(--text-mute);">Loading…</p>`;

    const { data, error } = await supabaseClient
      .from('artisans')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      adminList.innerHTML = `<p style="color:#B4232C;">Couldn't load submissions: ${escapeHtml(error.message)}</p>`;
      return;
    }

    allArtisans = data || [];
    updateArtisanCounts();
    renderArtisans();
  }

  function updateArtisanCounts() {
    document.getElementById('countPending').textContent =
      `(${allArtisans.filter((a) => a.status === 'pending').length})`;
    document.getElementById('countApproved').textContent =
      `(${allArtisans.filter((a) => a.status === 'approved').length})`;
    document.getElementById('countRejected').textContent =
      `(${allArtisans.filter((a) => a.status === 'rejected').length})`;
  }

  function renderArtisans() {
    const filtered = activeArtisanStatus === 'all'
      ? allArtisans
      : allArtisans.filter((a) => a.status === activeArtisanStatus);

    adminList.innerHTML = '';

    if (filtered.length === 0) {
      adminList.innerHTML = `<p style="color:var(--text-mute);">Nothing here yet.</p>`;
      return;
    }

    const statusLabels = { pending: 'Pending', approved: 'Verified', rejected: 'Rejected' };

    filtered.forEach((a) => {
      const photos = a.photo_urls || [];
      const badgeClass = `badge-${escapeHtml(a.status)}`;

      const safeName = escapeHtml(a.full_name);
      const safeTrade = escapeHtml(a.trade);
      const safeArea = escapeHtml(a.area);
      const safeYears = escapeHtml(a.years_experience);
      const safePhone = escapeHtml(a.phone);
      const safeEmail = a.email ? escapeHtml(a.email) : '';
      const safeBio = escapeHtml(a.bio);
      const safeStatusLabel = escapeHtml(a.status === 'approved' && a.founding_number ? `Founding #${a.founding_number}` : (statusLabels[a.status] || a.status));

      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `
        <div class="admin-thumbs">
          ${photos.slice(0, 3).map((url) => `<div class="thumb"><img src="${escapeHtml(url)}"></div>`).join('') || `<div class="thumb">No photo</div>`}
        </div>
        <div class="admin-info">
          <span class="admin-badge ${badgeClass}">${safeStatusLabel}</span>
          <h3>${safeName} · ${safeTrade}</h3>
          <div class="admin-meta">${safeArea} · ${safeYears} · ${safePhone}${safeEmail ? ' · ' + safeEmail : ''}</div>
          <p class="admin-bio">${safeBio}</p>
          ${photos.length < 3 ? `<p style="color:#b45309;font-weight:600;margin-top:6px;">⚠ Only ${photos.length} photo${photos.length === 1 ? '' : 's'} (LifeHub needs at least 3 before approval)</p>` : ''}
        </div>
        <div class="admin-actions">
          ${a.status !== 'approved' ? `<button class="btn btn-small btn-approve" data-id="${a.id}" data-action="approved">Approve</button>` : ''}
          ${a.status !== 'rejected' ? `<button class="btn btn-small btn-reject" data-id="${a.id}" data-action="rejected">Reject</button>` : ''}
          ${a.status !== 'pending' ? `<button class="btn btn-small btn-reject" data-id="${a.id}" data-action="pending">Back to pending</button>` : ''}
          ${a.status === 'approved' && !a.user_id ? `<button class="btn btn-small btn-approve" data-id="${a.id}" data-action="copylink">Copy dashboard setup link</button>` : ''}
          ${a.user_id ? `<span class="admin-meta" style="font-size:12.5px;">✓ Has dashboard</span><button class="btn btn-small btn-reject" data-id="${a.id}" data-action="resetpw">Reset password</button>` : ''}
          <button class="btn btn-small btn-delete" data-id="${a.id}" data-action="delete">Delete</button>
        </div>
      `;
      adminList.appendChild(row);
    });
  }

  adminList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;

    const id = btn.dataset.id;
    const action = btn.dataset.action;
    btn.disabled = true;

    if (action === 'resetpw') {
      const words = ['Hub', 'Lagos', 'Gold', 'Star', 'Neat', 'Work'];
      const r = crypto.getRandomValues(new Uint32Array(2));
      const suggested = words[r[0] % words.length] + String(100000 + (r[1] % 900000));
      const pw = prompt('Set a temporary password for this artisan (at least 8 characters).\nLeave it as it is to use the one suggested. Then send it to them on WhatsApp.', suggested);
      if (pw === null) { btn.disabled = false; return; }
      const { error: pwErr } = await supabaseClient.rpc('admin_reset_artisan_password', { p_artisan_id: id, p_new_password: pw.trim() });
      btn.disabled = false;
      if (pwErr) { alert('Could not reset the password: ' + pwErr.message + '\n\nDid you run password_reset.sql?'); return; }
      try { await navigator.clipboard.writeText(pw.trim()); } catch (e4) {}
      alert('Done. The temporary password is:\n\n' + pw.trim() + '\n\nSend it to the artisan on WhatsApp. They log in with their phone number and this password, then change it under Profile.');
      return;
    }

    if (action === 'copylink') {
      const { data: tk, error: tkErr } = await supabaseClient
        .from('artisan_tokens').select('token').eq('artisan_id', id).single();
      btn.disabled = false;
      if (tkErr || !tk) { alert('Could not find a setup link for this artisan. Did you run availability.sql and accounts_and_chat.sql?'); return; }
      const link = `${location.origin}/dashboard.html?claim=${tk.token}`;
      try { await navigator.clipboard.writeText(link); alert('Setup link copied. Send it to the artisan on WhatsApp. They use it once to create their password:\n\n' + link); }
      catch (e2) { prompt('Copy this link and send it to the artisan:', link); }
      return;
    }

    if (action === 'delete') {
      if (!confirm('Delete this submission permanently?')) {
        btn.disabled = false;
        return;
      }
      const { error } = await supabaseClient.from('artisans').delete().eq('id', id);
      if (error) { alert('Delete failed: ' + error.message); btn.disabled = false; return; }
    } else {
      if (action === 'approved') {
        const person = allArtisans.find((x) => String(x.id) === String(id));
        const count = person && person.photo_urls ? person.photo_urls.length : 0;
        if (count < 3 && !confirm(`This artisan has only ${count} photo(s). LifeHub needs at least 3 before approving.\n\nApprove anyway?`)) {
          btn.disabled = false;
          return;
        }
      }
      const { error } = await supabaseClient.from('artisans').update({ status: action }).eq('id', id);
      if (error) { alert('Update failed: ' + error.message); btn.disabled = false; return; }
    }

    await loadArtisans();
  });

  statusTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.status-tab');
    if (!tab) return;
    statusTabs.querySelectorAll('.status-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    activeArtisanStatus = tab.dataset.status;
    renderArtisans();
  });

  // ================= MESSAGES =================

  let allMessages = [];
  let activeMessageType = 'all';
  const messageTabs = document.getElementById('messageTabs');
  const messageList = document.getElementById('messageList');

  async function loadMessages() {
    messageList.innerHTML = `<p style="color:var(--text-mute);">Loading…</p>`;

    const { data, error } = await supabaseClient
      .from('contact_messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      messageList.innerHTML = `<p style="color:#B4232C;">Couldn't load messages: ${escapeHtml(error.message)}</p>`;
      return;
    }

    allMessages = data || [];
    const reportCount = allMessages.filter((m) => m.type === 'report').length;
    document.getElementById('msgCount').textContent = allMessages.length ? `(${allMessages.length})` : '';
    renderMessages();
    return reportCount;
  }

  function renderMessages() {
    const filtered = activeMessageType === 'all'
      ? allMessages
      : allMessages.filter((m) => m.type === activeMessageType);

    messageList.innerHTML = '';

    if (filtered.length === 0) {
      messageList.innerHTML = `<p style="color:var(--text-mute);">Nothing here yet.</p>`;
      return;
    }

    filtered.forEach((m) => {
      const isReport = m.type === 'report';
      const badgeClass = isReport ? 'badge-report' : 'badge-general';
      const badgeLabel = isReport ? 'Complaint/Report' : 'General';

      const row = document.createElement('div');
      row.className = 'admin-row';
      row.style.gridTemplateColumns = '1fr auto';
      row.innerHTML = `
        <div class="admin-info">
          <span class="admin-badge ${badgeClass}">${badgeLabel}</span>
          <h3>${escapeHtml(m.name)}</h3>
          <div class="admin-meta">${m.phone ? escapeHtml(m.phone) : ''}${m.phone && m.email ? ' · ' : ''}${m.email ? escapeHtml(m.email) : ''} · ${new Date(m.created_at).toLocaleDateString()}</div>
          <p class="admin-bio">${escapeHtml(m.message)}</p>
        </div>
        <div class="admin-actions">
          <button class="btn btn-small btn-delete" data-id="${m.id}" data-action="delete-message">Delete</button>
        </div>
      `;
      messageList.appendChild(row);
    });
  }

  messageList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action="delete-message"]');
    if (!btn) return;
    if (!confirm('Delete this message permanently?')) return;
    btn.disabled = true;
    const { error } = await supabaseClient.from('contact_messages').delete().eq('id', btn.dataset.id);
    if (error) { alert('Delete failed: ' + error.message); btn.disabled = false; return; }
    await loadMessages();
  });

  messageTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.status-tab');
    if (!tab) return;
    messageTabs.querySelectorAll('.status-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    activeMessageType = tab.dataset.type;
    renderMessages();
  });

  // ================= REVIEWS =================

  let allReviews = [];
  let activeReviewStatus = 'pending';
  const reviewTabs = document.getElementById('reviewTabs');
  const reviewList = document.getElementById('reviewList');

  async function loadReviews() {
    reviewList.innerHTML = `<p style="color:var(--text-mute);">Loading…</p>`;

    const { data, error } = await supabaseClient
      .from('reviews')
      .select('*, artisans(full_name)')
      .order('created_at', { ascending: false });

    if (error) {
      reviewList.innerHTML = `<p style="color:#B4232C;">Couldn't load reviews: ${escapeHtml(error.message)}</p>`;
      return;
    }

    allReviews = data || [];
    const pendingCount = allReviews.filter((r) => r.status === 'pending').length;
    document.getElementById('reviewCount').textContent = pendingCount ? `(${pendingCount})` : '';
    document.getElementById('countReviewPending').textContent = `(${pendingCount})`;
    renderReviews();
  }

  function renderReviews() {
    const filtered = activeReviewStatus === 'all'
      ? allReviews
      : allReviews.filter((r) => r.status === activeReviewStatus);

    reviewList.innerHTML = '';

    if (filtered.length === 0) {
      reviewList.innerHTML = `<p style="color:var(--text-mute);">Nothing here yet.</p>`;
      return;
    }

    filtered.forEach((r) => {
      const badgeClass = `badge-${escapeHtml(r.status)}`;
      const artisanName = r.artisans ? escapeHtml(r.artisans.full_name) : 'Unknown artisan';
      const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);

      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `
        <div class="admin-thumbs"><div class="thumb" style="font-size:18px;color:var(--marigold);">${stars}</div></div>
        <div class="admin-info">
          <span class="admin-badge ${badgeClass}">${escapeHtml(r.status)}</span>
          <h3>${escapeHtml(r.customer_name)} → ${artisanName}</h3>
          <div class="admin-meta">${new Date(r.created_at).toLocaleDateString()}</div>
          <p class="admin-bio">${r.comment ? escapeHtml(r.comment) : '(no comment)'}</p>
        </div>
        <div class="admin-actions">
          ${r.status !== 'approved' ? `<button class="btn btn-small btn-approve" data-id="${r.id}" data-action="approved">Approve</button>` : ''}
          ${r.status !== 'rejected' ? `<button class="btn btn-small btn-reject" data-id="${r.id}" data-action="rejected">Reject</button>` : ''}
          <button class="btn btn-small btn-delete" data-id="${r.id}" data-action="delete">Delete</button>
        </div>
      `;
      reviewList.appendChild(row);
    });
  }

  reviewList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    btn.disabled = true;

    if (action === 'delete') {
      if (!confirm('Delete this review permanently?')) { btn.disabled = false; return; }
      const { error } = await supabaseClient.from('reviews').delete().eq('id', id);
      if (error) { alert('Delete failed: ' + error.message); btn.disabled = false; return; }
    } else {
      const { error } = await supabaseClient.from('reviews').update({ status: action }).eq('id', id);
      if (error) { alert('Update failed: ' + error.message); btn.disabled = false; return; }
    }

    await loadReviews();
  });

  reviewTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.status-tab');
    if (!tab) return;
    reviewTabs.querySelectorAll('.status-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    activeReviewStatus = tab.dataset.status;
    renderReviews();
  });

  // ================= LEADS =================

  let allLeads = [];
  let activeLeadSource = 'all';
  const leadTabs = document.getElementById('leadTabs');
  const leadList = document.getElementById('leadList');
  const leadSummary = document.getElementById('leadSummary');

  async function loadLeads() {
    leadList.innerHTML = `<p style="color:var(--text-mute);">Loading…</p>`;

    const { data, error } = await supabaseClient
      .from('leads')
      .select('*, artisans(full_name, trade)')
      .order('created_at', { ascending: false });

    if (error) {
      leadList.innerHTML = `<p style="color:#B4232C;">Couldn't load leads: ${escapeHtml(error.message)}</p>`;
      return;
    }

    allLeads = data || [];
    document.getElementById('leadCount').textContent = allLeads.length ? `(${allLeads.length})` : '';
    renderLeadSummary();
    renderLeads();
  }

  function renderLeadSummary() {
    const byArtisan = {};
    allLeads.forEach((l) => {
      const name = l.artisans ? l.artisans.full_name : 'Unknown artisan';
      byArtisan[name] = (byArtisan[name] || 0) + 1;
    });

    const rows = Object.entries(byArtisan).sort((a, b) => b[1] - a[1]);

    if (rows.length === 0) {
      leadSummary.innerHTML = '';
      return;
    }

    leadSummary.innerHTML = `
      <div class="admin-row" style="grid-template-columns:1fr;">
        <div class="admin-info">
          <h3>Contact clicks by artisan</h3>
          <div class="admin-meta">
            ${rows.map(([name, count]) => `${escapeHtml(name)}: <strong>${count}</strong>`).join(' &nbsp;·&nbsp; ')}
          </div>
        </div>
      </div>
    `;
  }

  function renderLeads() {
    const filtered = activeLeadSource === 'all'
      ? allLeads
      : allLeads.filter((l) => l.source_page === activeLeadSource);

    leadList.innerHTML = '';

    if (filtered.length === 0) {
      leadList.innerHTML = `<p style="color:var(--text-mute);">No leads yet.</p>`;
      return;
    }

    filtered.forEach((l) => {
      const artisanName = l.artisans ? escapeHtml(l.artisans.full_name) : 'Unknown artisan';
      const trade = l.artisans && l.artisans.trade ? escapeHtml(l.artisans.trade) : '';
      const sourceLabel = l.source_page === 'profile' ? 'Profile page' : 'Browse page';

      const row = document.createElement('div');
      row.className = 'admin-row';
      row.style.gridTemplateColumns = '1fr auto';
      row.innerHTML = `
        <div class="admin-info">
          <span class="admin-badge">${sourceLabel}</span>
          <h3>${artisanName}${trade ? ' · ' + trade : ''}</h3>
          <div class="admin-meta">${new Date(l.created_at).toLocaleString()}</div>
        </div>
        <div class="admin-actions">
          <button class="btn btn-small btn-delete" data-id="${l.id}" data-action="delete-lead">Delete</button>
        </div>
      `;
      leadList.appendChild(row);
    });
  }

  leadList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action="delete-lead"]');
    if (!btn) return;
    if (!confirm('Delete this lead permanently?')) return;
    btn.disabled = true;
    const { error } = await supabaseClient.from('leads').delete().eq('id', btn.dataset.id);
    if (error) { alert('Delete failed: ' + error.message); btn.disabled = false; return; }
    await loadLeads();
  });

  leadTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.status-tab');
    if (!tab) return;
    leadTabs.querySelectorAll('.status-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    activeLeadSource = tab.dataset.source;
    renderLeads();
  });

  checkSession();
})();
