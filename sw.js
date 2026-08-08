const CACHE_NAME = 'wine-oracle-shell-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Never touch anything that isn't a plain GET. This protects every API
  // call (Supabase auth, the Anthropic edge function, OpenRouter critic
  // lookups) from ever being cached or intercepted, since none of those
  // should ever be served stale.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Only handle same-origin requests for the app shell itself. Everything
  // else — Google Fonts, the Supabase JS CDN script, api.anthropic.com,
  // openrouter.ai, supabase.co — passes straight through to the network,
  // completely untouched by this service worker.
  if (url.origin !== self.location.origin) return;

  // Network-first for the shell: always try to get the latest version,
  // and only fall back to the cached copy if the network is unavailable.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
