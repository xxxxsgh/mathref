// Service worker: cache-first para jogar offline.
const V = 'viciante3d-v1';
const FILES = [
  './', './index.html', './css/style.css', './icon.svg', './manifest.webmanifest',
  './vendor/three.module.min.js',
  './vendor/jsm/postprocessing/EffectComposer.js', './vendor/jsm/postprocessing/RenderPass.js',
  './vendor/jsm/postprocessing/ShaderPass.js', './vendor/jsm/postprocessing/UnrealBloomPass.js',
  './vendor/jsm/postprocessing/OutputPass.js', './vendor/jsm/postprocessing/Pass.js',
  './vendor/jsm/postprocessing/MaskPass.js', './vendor/jsm/shaders/CopyShader.js',
  './vendor/jsm/shaders/LuminosityHighPassShader.js', './vendor/jsm/shaders/OutputShader.js',
  './vendor/jsm/environments/RoomEnvironment.js', './vendor/jsm/geometries/RoundedBoxGeometry.js',
  ...['ai', 'arena', 'audio', 'camera', 'character', 'const', 'data', 'game', 'input', 'main', 'physics', 'player', 'props', 'replay', 'rules', 'shots', 'striker', 'traj', 'ui'].map(f => `./js/${f}.js`),
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    // fontes do Google: rede com fallback ao cache
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); return r; }).catch(() => caches.match(req)));
    return;
  }
  // rede primeiro (atualizações), cache como fallback
  e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); } return r; }).catch(() => caches.match(req, { ignoreSearch: true })));
});
