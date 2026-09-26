(function () {
  const params = new URLSearchParams(window.location.search);
  const artisanId = params.get('artisan_id');
  const artisanName = params.get('artisan_name');

  const heading = document.getElementById('reviewHeading');
  if (artisanName) {
    heading.textContent = `How was your experience with ${artisanName}?`;
  }
  document.getElementById('artisanId').value = artisanId || '';

  const stars = document.querySelectorAll('.star');
  let selectedRating = 0;

  stars.forEach((star) => {
    star.addEventListener('click', () => {
      selectedRating = parseInt(star.dataset.value, 10);
      stars.forEach((s) => {
        s.classList.toggle('active', parseInt(s.dataset.value, 10) <= selectedRating);
      });
    });
  });

  const form = document.getElementById('reviewForm');
  const successState = document.getElementById('successState');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!artisanId) {
      alert('Missing artisan reference — please go back to the artisan\'s listing and try again.');
      return;
    }
    if (selectedRating === 0) {
      alert('Please pick a star rating.');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      const { error } = await supabaseClient.from('reviews').insert({
        artisan_id: artisanId,
        customer_name: document.getElementById('reviewerName').value.trim(),
        rating: selectedRating,
        comment: document.getElementById('reviewComment').value.trim() || null,
      });

      if (error) throw error;

      form.style.display = 'none';
      successState.style.display = 'block';
    } catch (err) {
      console.error('Review submission failed:', err);
      alert('Something went wrong submitting your review. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
})();