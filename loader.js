/* LifeHub splash loader: logo pulses while the page loads. Shown once per visit (not on every page). */
(function () {
  try {
    if (sessionStorage.getItem('lh-splash')) return;
    sessionStorage.setItem('lh-splash', '1');
  } catch (e) {}
  var style = document.createElement('style');
  style.textContent =
    '#lh-splash{position:fixed;inset:0;z-index:99999;background:#FAF7F0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;transition:opacity .35s ease}' +
    '#lh-splash.out{opacity:0;pointer-events:none}' +
    '#lh-splash img{width:84px;height:84px;animation:lhpulse 1.1s ease-in-out infinite}' +
    '#lh-splash span{font:700 22px "Space Grotesk",system-ui,sans-serif;color:#1B2A4A;letter-spacing:.2px}' +
    '#lh-splash i{display:block;width:120px;height:4px;border-radius:4px;background:rgba(27,42,74,.12);overflow:hidden;position:relative}' +
    '#lh-splash i::after{content:"";position:absolute;inset:0;width:40%;background:#F5A623;border-radius:4px;animation:lhbar 1s ease-in-out infinite}' +
    '@keyframes lhpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}' +
    '@keyframes lhbar{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}' +
    '@media (prefers-reduced-motion:reduce){#lh-splash img,#lh-splash i::after{animation:none}}';
  document.head.appendChild(style);
  var box = document.createElement('div');
  box.id = 'lh-splash';
  box.setAttribute('role', 'status');
  box.setAttribute('aria-label', 'Loading LifeHub');
  box.innerHTML = '<img src="logo-mark.png" alt=""><span>LifeHub</span><i></i>';
  (document.body || document.documentElement).appendChild(box);
  var shownAt = Date.now(), gone = false;
  function hide() {
    if (gone) return; gone = true;
    var wait = Math.max(0, 500 - (Date.now() - shownAt));
    setTimeout(function () {
      box.classList.add('out');
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 400);
    }, wait);
  }
  if (document.readyState === 'complete') hide(); else window.addEventListener('load', hide);
  setTimeout(hide, 4000); // never block the page
})();