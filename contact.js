(function () {
  const form = document.getElementById('contactForm');
  const formLayout = document.getElementById('formLayout');
  const successState = document.getElementById('successState');

  if (!form) return;

  // If arriving via a "Report this listing" link, prefill the message
  const params = new URLSearchParams(window.location.search);
  const reportName = params.get('report');
  const isReport = Boolean(reportName);
  if (reportName) {
    const messageField = document.getElementById('contactMessage');
    messageField.value = `I'd like to report an issue with the listing for "${reportName}": `;
    messageField.focus();
    messageField.setSelectionRange(messageField.value.length, messageField.value.length);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    try {
      const { error } = await supabaseClient.from('contact_messages').insert({
        name: form.contactName.value.trim(),
        email: form.contactEmail.value.trim() || null,
        phone: form.contactPhone.value.trim() || null,
        message: form.contactMessage.value.trim(),
        type: isReport ? 'report' : 'general',
      });

      if (error) throw error;

      formLayout.style.display = 'none';
      successState.style.display = 'block';
      successState.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error('Contact submission failed:', err);
      alert('Something went wrong sending your message. Please check your connection and try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
})();