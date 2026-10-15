/* LifeHub service worker
 * - Pages: network first, fall back to the last cached copy when offline
 * - Same-site static files (css, js, images): serve from cache, refresh in background
 * - Never touches other sites (Supabase, Google Analytics, CDNs) or the admin page
 * Bump VERSION whenever you deploy changes so visitors get fresh files.
 */
const VERSION = "lifehub-v4";

const PRECACHE = [
  "./",
  "browse.html",
  "signup.html",
  "contact.html",
  "styles.css",
  "script.js",
  "browse.js",
  "supabase-config.js",
  "icons/icon-192.png",
];

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Offline — LifeHub</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#FAF7F0;color:#1B2A4A;font-family:system-ui,-apple-system,Segoe UI,sans-serif;text-align:center;padding:24px}
  h1{font-size:22px;margin:0 0 8px} p{margin:0 0 20px;color:#3A4A6B}
  button{background:#F5A623;color:#1B2A4A;border:0;border-radius:999px;padding:12px 22px;font-size:15px;font-weight:600}
</style></head>
<body><div>
  <h1>You're offline</h1>
  <p>LifeHub needs a connection to load artisans. Check your data or Wi-Fi and try again.</p>
  <button onclick="location.reload()">Try again</button>
</div></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) =>
        // add files one by one so a single missing file never blocks the install
        Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => null))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave Supabase, GA, CDNs alone
  if (url.pathname.includes("admin")) return; // never cache the admin dashboard

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches
            .match(req)
            .then(
              (hit) =>
                hit ||
                new Response(OFFLINE_HTML, {
                  headers: { "Content-Type": "text/html; charset=utf-8" },
                }),
            ),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const refresh = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || refresh;
    }),
  );
});
