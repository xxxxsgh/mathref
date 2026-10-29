// Service worker do Herói Tricolor.
// O mesmo código está embutido no index.html (SW_FONTE) e é registrado via
// Blob primeiro; como os navegadores recusam service worker com URL blob:,
// este arquivo é o plano B para o modo offline. Mantenha os dois iguais.
const CACHE='heroi-tricolor-v1';
const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll([self.registration.scope,THREE_URL]).catch(()=>{})).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE&&k.startsWith('heroi-tricolor')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET') return;
  if(r.mode==='navigate'){
    e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp));return res;})
      .catch(()=>caches.match(r).then(m=>m||caches.match(self.registration.scope))));
    return;
  }
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp));}return res;})));
});
