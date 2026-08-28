const CACHE_NAME='aethernfall-v31r2';
const CORE=['./','./index.html','./style.css?v=31r2','./game.js?v=31r2','./manifest.json?v=31r2'];

self.addEventListener('install',event=>{
 event.waitUntil(
   caches.open(CACHE_NAME)
    .then(c=>c.addAll(CORE).catch(()=>{}))
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

 // Always prefer fresh app code so GitHub updates are not hidden by an old cache.
 const isApp = url.pathname.endsWith('/') ||
               /\/(index\.html|game\.js|style\.css|manifest\.json)$/.test(url.pathname);
 if(isApp){
   event.respondWith(
     fetch(req,{cache:'no-store'})
      .then(res=>{const copy=res.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy));return res})
      .catch(()=>caches.match(req).then(r=>r||caches.match('./index.html')))
   );
   return;
 }

 // Cache static images after first successful network fetch.
 if(/\.(png|jpg|jpeg|webp|svg|ico)$/i.test(url.pathname)){
   event.respondWith(
     caches.match(req).then(hit=>hit||fetch(req).then(res=>{
       const copy=res.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy));return res;
     }))
   );
 }
});
