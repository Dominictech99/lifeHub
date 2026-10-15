/* LifeHub PWA helper
 * 1. Makes sure the manifest + theme colour are on the page
 * 2. Registers the service worker
 * 3. Shows an "Install LifeHub" bar (Android/Chrome) or "Add to Home Screen" tip (iPhone)
 * Any element with the attribute data-install-app also becomes an install button.
 */
(function () {
  // ---- 1. head tags (safe fallback if a page forgot them) ----
  function ensureHead() {
    if (!document.querySelector('link[rel="manifest"]')) {
      const l = document.createElement('link');
      l.rel = 'manifest';
      l.href = 'manifest.json';
      document.head.appendChild(l);
    }
    if (!document.querySelector('meta[name="theme-color"]')) {
      const m = document.createElement('meta');
      m.name = 'theme-color';
      m.content = '#1B2A4A';
      document.head.appendChild(m);
    }
    if (!document.querySelector('link[rel="apple-touch-icon"]')) {
      const a = document.createElement('link');
      a.rel = 'apple-touch-icon';
      a.href = 'icons/apple-touch-icon.png';
      document.head.appendChild(a);
    }
  }
  ensureHead();

  // ---- 2. service worker ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('Service worker registration failed:', err);
      });
    });
  }

  // ---- 3. install UI ----
  const DISMISS_KEY = 'lifehub-install-dismissed';
  const DISMISS_DAYS = 7;

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

  function recentlyDismissed() {
    try {
      const t = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
      return t && Date.now() - t < DISMISS_DAYS * 24 * 60 * 60 * 1000;
    } catch (e) {
      return false;
    }
  }

  function rememberDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch (e) {}
  }

  if (isStandalone) return; // already installed, nothing to show

  let deferredPrompt = null;
  let bar = null;

  function injectStyles() {
    if (document.getElementById('pwaInstallStyles')) return;
    const s = document.createElement('style');
    s.id = 'pwaInstallStyles';
    s.textContent =
      '#pwaInstallBar{position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;display:flex;align-items:center;gap:12px;' +
      'background:#1B2A4A;color:#FAF7F0;border-radius:14px;padding:12px 14px;box-shadow:0 8px 28px rgba(27,42,74,.35);' +
      'font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.35;max-width:520px;margin:0 auto}' +
      '#pwaInstallBar .pwa-text{flex:1}' +
      '#pwaInstallBar strong{display:block;font-size:15px}' +
      '#pwaInstallBar button{border:0;cursor:pointer;font-family:inherit}' +
      '#pwaInstallBar .pwa-go{background:#F5A623;color:#1B2A4A;font-weight:700;border-radius:999px;padding:9px 16px;font-size:14px}' +
      '#pwaInstallBar .pwa-x{background:none;color:#FAF7F0;font-size:22px;line-height:1;padding:0 4px;opacity:.8}';
    document.head.appendChild(s);
  }

  function removeBar() {
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    bar = null;
  }

  function showBar(mode) {
    if (bar || recentlyDismissed()) return;
    injectStyles();
    bar = document.createElement('div');
    bar.id = 'pwaInstallBar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Install LifeHub');

    const text = document.createElement('div');
    text.className = 'pwa-text';
    const title = document.createElement('strong');
    title.textContent = 'Get the LifeHub app';
    const sub = document.createElement('span');
    sub.textContent =
      mode === 'ios'
        ? 'Tap the Share icon, then "Add to Home Screen".'
        : 'Install it on your phone for faster access to trusted artisans.';
    text.appendChild(title);
    text.appendChild(sub);
    bar.appendChild(text);

    if (mode === 'prompt') {
      const go = document.createElement('button');
      go.className = 'pwa-go';
      go.type = 'button';
      go.textContent = 'Install';
      go.addEventListener('click', triggerInstall);
      bar.appendChild(go);
    }

    const x = document.createElement('button');
    x.className = 'pwa-x';
    x.type = 'button';
    x.setAttribute('aria-label', 'Dismiss');
    x.innerHTML = '&times;';
    x.addEventListener('click', function () {
      rememberDismiss();
      removeBar();
    });
    bar.appendChild(x);

    document.body.appendChild(bar);
  }

  function triggerInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(function () {
      deferredPrompt = null;
      removeBar();
      toggleInstallButtons(false);
    });
  }

  function toggleInstallButtons(show) {
    document.querySelectorAll('[data-install-app]').forEach(function (el) {
      el.style.display = show ? '' : 'none';
    });
  }

  // hide any manual install buttons until installing is actually possible
  document.addEventListener('DOMContentLoaded', function () {
    toggleInstallButtons(false);
    document.querySelectorAll('[data-install-app]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        if (deferredPrompt) {
          triggerInstall();
        } else if (isIos) {
          alert('To install: tap the Share icon in Safari, then choose "Add to Home Screen".');
        }
      });
    });
    if (isIos) {
      toggleInstallButtons(true);
      setTimeout(function () { showBar('ios'); }, 4000);
    }
  });

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    toggleInstallButtons(true);
    setTimeout(function () { showBar('prompt'); }, 4000);
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    removeBar();
    toggleInstallButtons(false);
  });
})();