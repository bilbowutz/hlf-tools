// Offline-Cache: App-Dateien vorab, alles andere beim ersten Abruf.
// Strategie: sofort aus dem Cache antworten und im Hintergrund aktualisieren.
// Fotos liegen in einem eigenen Cache, der App-Updates überlebt.
const CACHE = 'hlf-trainer-v15';
const IMG_CACHE = 'hlf-img-v1';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg',
  'js/app.js', 'js/crypto.js', 'js/leaderboard.js', 'js/truck.js', 'js/photo.js',
  'vendor/three.module.min.js', 'vendor/OrbitControls.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== IMG_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Fotos: nur aus dem Netz holen, wenn diese Version noch nicht gespeichert ist
async function imageFirst(request) {
  const cache = await caches.open(IMG_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    // Ältere Versionen desselben Fotos entfernen
    const path = new URL(request.url).pathname;
    for (const old of await cache.keys()) {
      if (new URL(old.url).pathname === path && old.url !== request.url) cache.delete(old);
    }
    await cache.put(request, res.clone());
  }
  return res;
}

// Die App schickt nach dem Entsperren die Liste aller Fotos zum Vorab-Speichern
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'precache') return;
  const scope = self.registration.scope;
  e.waitUntil(Promise.all(e.data.urls.map((u) => imageFirst(new Request(new URL(u, scope))).catch(() => {}))));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (/\/data\/img\/[^/]+\.enc$/.test(url.pathname)) {
    e.respondWith(imageFirst(e.request));
    return;
  }
  // Beladeliste immer frisch holen (klein), nur offline aus dem Cache
  if (/data\/(content\.enc|meta\.json)$/.test(url.pathname)) {
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const network = fetch(e.request).then((res) => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  }));
});
