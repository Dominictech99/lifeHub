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

  const MAX_PHOTOS = 8;
  const MAX_SIDE = 1280;      // longest side in pixels
  const JPEG_QUALITY = 0.8;
  const SKIP_UNDER = 250 * 1024; // small files are left alone

  // Shrinks big phone photos in the browser so uploads are fast on slow data.
  // If anything goes wrong, the original photo is used instead.
  async function compressImage(file) {
    try {
      if (file.size <= SKIP_UNDER && /jpeg|jpg|webp/.test(file.type)) return file;
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      if (bitmap.close) bitmap.close();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
      if (!blob || blob.size >= file.size) return file; // never make it bigger
      const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
      return new File([blob], name, { type: 'image/jpeg' });
    } catch (err) {
      console.warn('Could not compress photo, using original:', err);
      return file;
    }
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    for (const original of files) {
      if (selectedFiles.length >= MAX_PHOTOS) {
        alert(`You can add up to ${MAX_PHOTOS} photos.`);
        break;
      }
      const file = await compressImage(original);
      selectedFiles.push(file);
      renderThumb(file);
    }
    fileInput.value = ''; // lets the same photo be chosen again after removing it
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
        .upload(path, file, { contentType: file.type || 'image/jpeg', cacheControl: '31536000' });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabaseClient
        .storage
        .from('artisan-photos')
        .getPublicUrl(path);

      urls.push(publicUrlData.publicUrl);
    }
    return urls;
  }

  // artisans log in with their phone number; behind the scenes it becomes a private sign-in name
  function waNumber(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = '234' + d.slice(1);
    else if (d.length === 10) d = '234' + d;
    return d;
  }
  function authEmail(phone) {
    const base = String(window.LIFEHUB_AUTH_BASE || '');
    const m = base.match(/^([^@+\s]+)@([^@\s]+\.[^@\s]+)$/);
    if (!m || /YOUR_LIFEHUB_GMAIL/i.test(base)) {
      throw new Error('Login setup is not finished. Please tell LifeHub.');
    }
    return m[1] + '+p' + waNumber(phone) + '@' + m[2];
  }

  // Creates the login account. If the person started signing up before, signs them back in.
  async function ensureAccount(phone, password) {
    const email = authEmail(phone);
    const up = await supabaseClient.auth.signUp({ email, password });
    if (!up.error) {
      if (!up.data.session) throw new Error('Account setup is not finished yet. Please tell LifeHub.');
      return;
    }
    if (/already registered|already been registered/i.test(up.error.message)) {
      const si = await supabaseClient.auth.signInWithPassword({ email, password });
      if (si.error) throw new Error('This phone number already has an account. Please log in on the dashboard page.');
      const { data: existing } = await supabaseClient
        .from('artisans').select('id').eq('user_id', si.data.user.id).maybeSingle();
      if (existing) throw new Error('This phone number already has a LifeHub listing. Please log in on the dashboard page.');
      return;
    }
    throw up.error;
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

      const phoneValue = form.phone.value.trim();
      const pw = form.password.value;
      if (waNumber(phoneValue).length < 10) throw new Error('Please enter a valid phone number.');
      if (pw.length < 8) throw new Error('Your password must be at least 8 characters.');
      if (pw !== form.password2.value) throw new Error('The two passwords are not the same.');

      await ensureAccount(phoneValue, pw);

      const photoUrls = selectedFiles.length ? await uploadPhotos() : [];

      const { error } = await supabaseClient.from('artisans').insert({
        full_name: form.fullName.value.trim(),
        phone: phoneValue,
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
      const known = err && err.message && !/fetch|network|JWT|PGRST|violates|row-level/i.test(err.message);
      alert(known ? err.message : 'Something went wrong submitting your details. Please check your connection and try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  });
})();