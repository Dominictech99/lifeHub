(function () {
  const container = document.getElementById('profileContainer');

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function getIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  async function loadArtisan() {
    const id = getIdFromUrl();
    if (!id) {
      container.innerHTML = `<div class="empty-state"><h3>Artisan not found</h3><p><a href="browse.html">Browse all artisans</a></p></div>`;
      return;
    }

    const { data: artisan, error } = await supabaseClient
      .from('artisans')
      .select('*')
      .eq('id', id)
      .eq('status', 'approved')
      .single();

    if (error || !artisan) {
      container.innerHTML = `<div class="empty-state"><h3>Artisan not found</h3><p><a href="browse.html">Browse all artisans</a></p></div>`;
      return;
    }

    const { data: reviews } = await supabaseClient
      .from('reviews')
      .select('rating, comment, reviewer_name, created_at')
      .eq('artisan_id', id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    render(artisan, reviews || []);
  }

  function render(a, reviews) {
    const photos = a.photo_urls && a.photo_urls.length ? a.photo_urls : [];
    const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) : null;

    const safeName = escapeHtml(a.full_name);
    const safeTrade = escapeHtml(a.trade);
    const safeArea = escapeHtml(a.area);
    const safeYears = escapeHtml(a.years_experience);
    const safeBio = escapeHtml(a.bio);
    const safePhone = escapeHtml(a.phone);

    // Update page title and meta description for sharing
    document.title = `${a.full_name} — Verified ${a.trade} in Lagos | LifeHub`;

    const photosHtml = photos.length
      ? photos.map(p => `<div class="photo-stack-item"><img src="${escapeHtml(p)}" style="width:100%;border-radius:12px;object-fit:cover;"></div>`).join('')
      : '';

    const ratingHtml = avg
      ? `<div class="rating-summary"><span class="stars-inline">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))}</span> ${avg.toFixed(1)} <span class="rating-count">(${reviews.length} review${reviews.length === 1 ? '' : 's'})</span></div>`
      : `<div class="rating-summary rating-count">No reviews yet</div>`;

    const reviewsHtml = reviews.length
      ? reviews.map(r => `
        <div class="safety-item">
          <span class="stars-inline">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
          <p>${escapeHtml(r.comment)}</p>
          <div class="artisan-meta">— ${escapeHtml(r.reviewer_name || 'Anonymous')}</div>
        </div>`).join('')
      : '';

    const profileUrl = window.location.href;

    container.innerHTML = `
      <div class="eyebrow-pin"><span class="dot"></span>${safeTrade} · ${safeArea}</div>
      <h1>${safeName}</h1>
      <div class="verified-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>
        Verified by LifeHub
      </div>
      ${ratingHtml}
      <p class="lede">${safeBio}</p>
      <div class="artisan-meta">${safeYears} experience</div>

      <div class="artisan-grid" style="margin-top:24px;">${photosHtml}</div>

      <div style="margin-top:24px;display:flex;gap:12px;flex-wrap:wrap;">
        <button class="btn btn-secondary" id="contactBtn" data-phone="${safePhone}">Contact ${escapeHtml((a.full_name || '').split(' ')[0])}</button>
        <button class="btn btn-text" id="shareBtn">Share this profile</button>
        <a href="review.html?artisan_id=${encodeURIComponent(a.id)}&artisan_name=${encodeURIComponent(a.full_name || '')}" class="btn btn-text">Leave a review</a>
      </div>

      <h2 class="heading-sm" style="margin-top:40px;">Reviews</h2>
      <div class="safety-grid">${reviewsHtml || '<p>No reviews yet.</p>'}</div>
    `;

    document.getElementById('contactBtn').addEventListener('click', () => {
      supabaseClient.from('leads').insert({ artisan_id: a.id, source_page: 'profile' }).then(() => {});
      window.open(`https://wa.me/${safePhone.replace(/\D/g, '')}`, '_blank');
    });

    document.getElementById('shareBtn').addEventListener('click', () => {
      const text = `Check out ${a.full_name} (${a.trade}) on LifeHub: ${profileUrl}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    });
  }

  loadArtisan();
})();