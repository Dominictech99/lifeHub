(function () {
  const grid = document.getElementById('artisanGrid');
  const searchInput = document.getElementById('searchInput');
  const filterChips = document.getElementById('filterChips');

  let allArtisans = [];
  let ratingsByArtisan = {};
  let activeTrade = 'All';
  let query = '';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function loadArtisans() {
    grid.innerHTML = `<div class="empty-state"><h3>Loading artisans…</h3></div>`;

    const { data, error } = await supabaseClient
      .from('artisans')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load artisans:', error);
      grid.innerHTML = `
        <div class="empty-state">
          <h3>Couldn't load artisans</h3>
          <p>Check your connection and refresh the page.</p>
        </div>`;
      return;
    }

    allArtisans = data || [];
    await loadRatings();
    render();
  }

  async function loadRatings() {
    const { data, error } = await supabaseClient
      .from('reviews')
      .select('artisan_id, rating')
      .eq('status', 'approved');

    if (error) {
      console.error('Failed to load reviews:', error);
      ratingsByArtisan = {};
      return;
    }

    const grouped = {};
    (data || []).forEach((r) => {
      if (!grouped[r.artisan_id]) grouped[r.artisan_id] = [];
      grouped[r.artisan_id].push(r.rating);
    });

    ratingsByArtisan = {};
    Object.keys(grouped).forEach((id) => {
      const ratings = grouped[id];
      const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      ratingsByArtisan[id] = { avg, count: ratings.length };
    });
  }

  function render() {
    const filtered = allArtisans.filter((a) => {
      const matchesTrade = activeTrade === 'All' || a.trade === activeTrade;
      const haystack = `${a.full_name} ${a.trade} ${a.area}`.toLowerCase();
      const matchesQuery = haystack.includes(query.toLowerCase());
      return matchesTrade && matchesQuery;
    });

    grid.innerHTML = '';

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <h3>No artisans match yet</h3>
          <p>Try a different trade or search term — we're adding more people across Lagos every week.</p>
        </div>`;
      return;
    }

    filtered.forEach((a) => {
      const photos = a.photo_urls && a.photo_urls.length ? a.photo_urls : [];
      const mainPhoto = photos[0];
      const sidePhotos = photos.slice(1, 3);

      const safeName = escapeHtml(a.full_name);
      const safeTrade = escapeHtml(a.trade);
      const safeArea = escapeHtml(a.area);
      const safeYears = escapeHtml(a.years_experience);
      const safeBio = escapeHtml(a.bio);
      const safePhone = escapeHtml(a.phone);
      const safeFirstName = escapeHtml((a.full_name || '').split(' ')[0]);
      const safeMainPhoto = mainPhoto ? escapeHtml(mainPhoto) : '';
      const safeSide0 = sidePhotos[0] ? escapeHtml(sidePhotos[0]) : '';
      const safeSide1 = sidePhotos[1] ? escapeHtml(sidePhotos[1]) : '';

      const ratingInfo = ratingsByArtisan[a.id];
      const ratingHtml = ratingInfo
        ? `<div class="rating-summary"><span class="stars-inline">${'★'.repeat(Math.round(ratingInfo.avg))}${'☆'.repeat(5 - Math.round(ratingInfo.avg))}</span> ${ratingInfo.avg.toFixed(1)} <span class="rating-count">(${ratingInfo.count} review${ratingInfo.count === 1 ? '' : 's'})</span></div>`
        : `<div class="rating-summary rating-count">No reviews yet</div>`;

      const card = document.createElement('div');
      card.className = 'artisan-card';
      card.innerHTML = `
        <div class="artisan-photos">
          <div class="photo-main">${mainPhoto ? `<img src="${safeMainPhoto}" style="width:100%;height:100%;object-fit:cover;">` : 'Photo'}</div>
          <div class="photo-stack">
            <div>${sidePhotos[0] ? `<img src="${safeSide0}" style="width:100%;height:100%;object-fit:cover;">` : 'Photo'}</div>
            <div>${sidePhotos[1] ? `<img src="${safeSide1}" style="width:100%;height:100%;object-fit:cover;">` : 'Photo'}</div>
          </div>
        </div>
        <div class="artisan-body">
          <div class="artisan-top">
            <h3>${safeName}</h3>
            <span class="trade-tag">${safeTrade}</span>
          </div>
          <div class="verified-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>
            Verified by LifeHub
          </div>
          ${ratingHtml}
          <div class="artisan-meta">${safeArea} · ${safeYears}</div>
          <p class="artisan-bio">${safeBio}</p>
          <button class="btn btn-secondary artisan-contact" type="button" data-phone="${safePhone}" data-artisan-id="${escapeHtml(a.id)}">Contact ${safeFirstName}</button>
          <a href="artisan.html?id=${encodeURIComponent(a.id)}" class="review-link">View full profile</a>
          <a href="review.html?artisan_id=${encodeURIComponent(a.id)}&artisan_name=${encodeURIComponent(a.full_name || '')}" class="review-link">Leave a review</a>
          <a href="contact.html?report=${encodeURIComponent(a.full_name || '')}" class="report-link">Report this listing</a>
        </div>
      `;
      grid.appendChild(card);
    });

    grid.querySelectorAll('.artisan-contact').forEach((btn) => {
      btn.dataset.original = btn.textContent;
    });
  }

  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('.artisan-contact');
    if (!btn) return;
    const phone = btn.dataset.phone;
    const artisanId = btn.dataset.artisanId;
    if (artisanId) {
      supabaseClient.from('leads').insert({ artisan_id: artisanId, source_page: 'browse' }).then(() => {});
    }
    if (phone) {
      window.open(`https://wa.me/${phone.replace(/\D/g, '')}`, '_blank');
    }
  });

  filterChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    filterChips.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    activeTrade = chip.dataset.trade;
    render();
  });

  searchInput.addEventListener('input', (e) => {
    query = e.target.value;
    render();
  });

  loadArtisans();
})();