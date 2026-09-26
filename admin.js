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

  async function checkSession() {
    const { data } = await supabaseClient.auth.getSession();
    if (data.session) {
      showDashboard();
    } else {
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
    ['artisans', 'messages', 'reviews', 'leads'].forEach((p) => {
      document.getElementById(`panel-${p}`).style.display = p === panel ? 'block' : 'none';
    });
  });

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
      const safeStatusLabel = escapeHtml(statusLabels[a.status] || a.status);

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
        </div>
        <div class="admin-actions">
          ${a.status !== 'approved' ? `<button class="btn btn-small btn-approve" data-id="${a.id}" data-action="approved">Approve</button>` : ''}
          ${a.status !== 'rejected' ? `<button class="btn btn-small btn-reject" data-id="${a.id}" data-action="rejected">Reject</button>` : ''}
          ${a.status !== 'pending' ? `<button class="btn btn-small btn-reject" data-id="${a.id}" data-action="pending">Back to pending</button>` : ''}
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

    if (action === 'delete') {
      if (!confirm('Delete this submission permanently?')) {
        btn.disabled = false;
        return;
      }
      const { error } = await supabaseClient.from('artisans').delete().eq('id', id);
      if (error) { alert('Delete failed: ' + error.message); btn.disabled = false; return; }
    } else {
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