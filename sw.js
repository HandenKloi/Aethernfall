const CACHE_NAME='aethernfall-v34';
const CORE=['./','./index.html','./style.css?v=3400','./game.js?v=3400','./manifest.json?v=3400'];

self.addEventListener('install',event=>{
 event.waitUntil(
  caches.open(CACHE_NAME)
   .then(cache=>cache.addAll(CORE).catch(()=>{}))
   .then(()=>self.skipWaiting())
 );
});

self.addEventListener('activate',event=>{
 event.waitUntil(
  caches.keys()
   .then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
   .then(()=>self.clients.claim())
 );
});

self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;

 const url=new URL(req.url);
 const isApp=url.pathname.endsWith('/')||
  /\/(index\.html|game\.js|style\.css|manifest\.json)$/.test(url.pathname);

 if(isApp){
  event.respondWith(
   fetch(req,{cache:'no-store'}).then(res=>{
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const copy=res.clone();
    caches.open(CACHE_NAME).then(c=>c.put(req,copy));
    return res;
   }).catch(()=>caches.match(req).then(r=>r||caches.match('./index.html')))
  );
  return;
 }

 if(/\.(png|jpg|jpeg|webp|svg|ico)$/i.test(url.pathname)){
  event.respondWith(
   caches.match(req).then(hit=>{
    if(hit)return hit;
    return fetch(req).then(res=>{
     if(!res.ok)throw new Error(`HTTP ${res.status}`);
     const copy=res.clone();
     caches.open(CACHE_NAME).then(c=>c.put(req,copy));
     return res;
    }).catch(()=>caches.match(req));
   })
  );
 }
});
