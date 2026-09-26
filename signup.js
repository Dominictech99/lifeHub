(function () {
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  const previewGrid = document.getElementById('previewGrid');
  const form = document.getElementById('signupForm');
  const formLayout = document.getElementById('formLayout');
  const successState = document.getElementById('successState');

  if (!uploadZone) return;

  let selectedFiles = [];

  uploadZone.addEventListener('click', () => fileInput.click());

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
  });

  function handleFiles(fileList) {
    Array.from(fileList).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      selectedFiles.push(file);
      renderThumb(file);
    });
  }

  function renderThumb(file) {
    const thumb = document.createElement('div');
    thumb.className = 'preview-thumb';

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement('img');
      img.src = e.target.result;
      thumb.appendChild(img);
    };
    reader.readAsDataURL(file);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.setAttribute('aria-label', 'Remove photo');
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      selectedFiles = selectedFiles.filter((f) => f !== file);
      thumb.remove();
    });
    thumb.appendChild(removeBtn);

    previewGrid.appendChild(thumb);
  }

  const tradeOtherRadio = document.getElementById('tradeOtherRadio');
  const tradeOtherWrap = document.getElementById('tradeOtherWrap');
  const tradeOtherInput = document.getElementById('tradeOtherInput');

  form.querySelectorAll('input[name="trade"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const isOther = tradeOtherRadio.checked;
      tradeOtherWrap.style.display = isOther ? 'block' : 'none';
      tradeOtherInput.required = isOther;
    });
  });

  async function uploadPhotos() {
    const urls = [];
    for (const file of selectedFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;

      const { error: uploadError } = await supabaseClient
        .storage
        .from('artisan-photos')
        .upload(path, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabaseClient
        .storage
        .from('artisan-photos')
        .getPublicUrl(path);

      urls.push(publicUrlData.publicUrl);
    }
    return urls;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      const tradeInput = form.querySelector('input[name="trade"]:checked');
      const tradeValue = (tradeInput && tradeInput.value === 'Other' && tradeOtherInput.value.trim())
        ? tradeOtherInput.value.trim()
        : (tradeInput ? tradeInput.value : null);

      const photoUrls = selectedFiles.length ? await uploadPhotos() : [];

      const { error } = await supabaseClient.from('artisans').insert({
        full_name: form.fullName.value.trim(),
        phone: form.phone.value.trim(),
        email: form.email.value.trim() || null,
        trade: tradeValue,
        area: form.area.value.trim(),
        years_experience: form.experience.value,
        bio: form.bio.value.trim(),
        photo_urls: photoUrls,
      });

      if (error) throw error;

      formLayout.style.display = 'none';
      successState.style.display = 'block';
      successState.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error('Signup submission failed:', err);
      alert('Something went wrong submitting your details. Please check your connection and try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  });
})();