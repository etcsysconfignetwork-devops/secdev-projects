const CACHE_NAME = "tisports♔-v2";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json"
];

// INSTALACIÓN
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS))
  );
});

// ACTIVACIÓN (BORRA CACHE VIEJO)
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null)
    ))
  );
  self.clients.claim();
});

// FETCH (ESTRATEGIA INTELIGENTE)
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  // NO CACHEAR STREAMS MPD / DRM
  if (
    url.pathname.endsWith(".mpd") ||
    url.pathname.endsWith(".m3u8") ||
    url.hostname.includes("cloudfront.net") ||
    url.hostname.includes("drm") ||
    url.hostname.includes("widevine")
  ) {
    event.respondWith(fetch(event.request));
    return;
  }
  // CACHE FIRST PARA APP
  event.respondWith(
    caches.match(event.request).then(response => 
      response || fetch(event.request).then(networkResponse => 
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        })
      )
    )
  );
});