// Service worker: jogo offline depois do primeiro acesso.
// Arquivos do próprio site: stale-while-revalidate (abre na hora com o cache
// e atualiza em segundo plano). CDN (Three.js) e fontes: cache-first.
const VERSION = 'pixelfutsal-v1';
const CORE = [
  './', './index.html', './manifest.json', './css/style.css',
  './js/main.js', './js/util.js', './js/data.js', './js/save.js', './js/physics.js', './js/input.js',
  './js/models.js', './js/render.js', './js/camera.js', './js/audio.js', './js/ai.js', './js/game.js',
  './js/ui.js', './js/career.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // um arquivo que falhe não impede a instalação dos outros
    await Promise.all(CORE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const cdn = /cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url.host);
  if (!sameOrigin && !cdn) return;

  if (cdn) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') (await caches.open(VERSION)).put(req, res.clone());
        return res;
      } catch { return hit || Response.error(); }
    })());
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
    return Response.error();
  })());
});
