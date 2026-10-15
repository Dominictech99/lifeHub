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
  const ua = navigator.userAgent || '';
  const isIos = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
  const isInApp = /FBAN|FBAV|Instagram|musical_ly|BytedanceWebview|TikTok|Line\/|Twitter|; wv\)/i.test(ua);

  function whenReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function setInstallButtons(show) {
    document.querySelectorAll('[data-install-app]').forEach(function (el) {
      el.style.display = show ? '' : 'none';
    });
  }

  // already installed: no install buttons, no bar
  if (isStandalone) {
    whenReady(function () { setInstallButtons(false); });
    return;
  }

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
      '#pwaInstallBar .pwa-go{background:#F5A623;color:#1B2A4A;font-weight:700;border-radius:999px;padding:10px 18px;font-size:14px}' +
      '#pwaInstallBar .pwa-x{background:none;color:#FAF7F0;font-size:24px;line-height:1;padding:6px 8px;opacity:.8}' +
      '#pwaHelp{position:fixed;inset:0;z-index:10000;background:rgba(27,42,74,.55);display:flex;align-items:flex-end;justify-content:center;padding:16px;' +
      'font-family:system-ui,-apple-system,Segoe UI,sans-serif}' +
      '#pwaHelp .pwa-sheet{background:#FAF7F0;color:#1B2A4A;border-radius:18px;max-width:420px;width:100%;padding:22px 20px;box-shadow:0 12px 40px rgba(0,0,0,.3)}' +
      '#pwaHelp h3{margin:0 0 10px;font-size:19px}' +
      '#pwaHelp ol{margin:0 0 16px;padding-left:20px;line-height:1.6;color:#3A4A6B}' +
      '#pwaHelp button{width:100%;border:0;border-radius:999px;background:#1B2A4A;color:#FAF7F0;font-weight:700;font-size:15px;padding:13px;cursor:pointer}';
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
    });
  }

  // step-by-step help for browsers that cannot show the install popup themselves
  function showHelp() {
    injectStyles();
    removeBar();
    let steps;
    if (isIos) {
      steps = ['Open LifeHub in <strong>Safari</strong>', 'Tap the <strong>Share</strong> icon (square with an arrow)', 'Choose <strong>Add to Home Screen</strong>', 'Tap <strong>Add</strong>'];
    } else if (isInApp) {
      steps = ['You are inside another app\'s browser', 'Tap the <strong>⋮</strong> or <strong>…</strong> menu', 'Choose <strong>Open in Chrome</strong> (or your browser)', 'Then tap <strong>Get the app</strong> again'];
    } else {
      steps = ['Open the <strong>⋮</strong> menu in Chrome', 'Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>', 'Tap <strong>Install</strong>'];
    }
    const wrap = document.createElement('div');
    wrap.id = 'pwaHelp';
    wrap.innerHTML = '<div class="pwa-sheet" role="dialog" aria-label="Get the LifeHub app"><h3>Get the LifeHub app</h3><ol>' +
      steps.map(function (t) { return '<li>' + t + '</li>'; }).join('') +
      '</ol><button type="button">Got it</button></div>';
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap || e.target.tagName === 'BUTTON') wrap.remove();
    });
    document.body.appendChild(wrap);
  }

  // any element with data-install-app is a "Get the app" button that is always visible
  whenReady(function () {
    document.querySelectorAll('[data-install-app]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        if (deferredPrompt) triggerInstall();
        else showHelp();
      });
    });
    if (isIos) setTimeout(function () { showBar('ios'); }, 4000);
  });

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    setTimeout(function () { showBar('prompt'); }, 4000);
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    removeBar();
    setInstallButtons(false);
  });
})();