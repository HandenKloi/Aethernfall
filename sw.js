const CACHE_NAME='aethernfall-v31f2';
const CORE=['./','./index.html','./style.css?v=3112','./game.js?v=3112','./manifest.json?v=3112'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(CORE).catch(()=>{})).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const r=e.request;if(r.method!=='GET')return;
 const u=new URL(r.url);
 const app=u.pathname.endsWith('/')||/(\/index\.html|\/game\.js|\/style\.css|\/manifest\.json)$/.test(u.pathname);
 if(app){
  e.respondWith(fetch(r,{cache:'no-store'}).then(res=>{
   const copy=res.clone();caches.open(CACHE_NAME).then(c=>c.put(r,copy));return res
  }).catch(()=>caches.match(r).then(x=>x||caches.match('./index.html'))));return;
 }
 if(/\.(png|jpg|jpeg|webp|svg|ico)$/i.test(u.pathname)){
  e.respondWith(caches.match(r).then(x=>x||fetch(r).then(res=>{
   const copy=res.clone();caches.open(CACHE_NAME).then(c=>c.put(r,copy));return res
  })));
 }
});
