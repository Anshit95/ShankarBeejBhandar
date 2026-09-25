const CACHE_NAME="sbb-pwa-v1";

self.addEventListener("install",event=>{
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=>
      cache.addAll([
        "./",
        "./index.html",
        "./style.css",
        "./app.js",
        "./manifest.json"
      ])
    )
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>
      Promise.all(
        keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))
      )
    ).then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);
  if(url.origin===location.origin){
    event.respondWith(
      fetch(event.request)
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
          return response;
        })
        .catch(()=>caches.match(event.request))
    );
  }else{
    event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
  }
});

self.addEventListener("message",event=>{
  if(event.data?.type==="SHOW_NOTIFICATION"){
    const title=event.data.title||"Shankar Beej Bhandar";
    const options={
      body:event.data.body||"",
      icon:"./icon-192.png",
      badge:"./icon-192.png",
      tag:event.data.tag||"sbb-notification",
      renotify:true
    };
    event.waitUntil(self.registration.showNotification(title,options));
  }
});
