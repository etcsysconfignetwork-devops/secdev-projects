const CACHE_NAME = "tisports-pwa-v3";

/*
=========================================================
 ARCHIVOS BÁSICOS DE LA PWA
=========================================================

IMPORTANTE:

La PWA ahora utiliza "/" como start_url.

No guardamos index.html como recurso principal
para evitar problemas con las respuestas de Cloudflare
relacionadas con / y /index.html.
*/

const APP_SHELL = [
  "/",
  "/manifest.json"
];


/*
=========================================================
 INSTALACIÓN
=========================================================
*/

self.addEventListener("install", event => {

  console.log(
    "[SW] Instalando:",
    CACHE_NAME
  );

  self.skipWaiting();

  event.waitUntil(

    caches.open(CACHE_NAME)
      .then(async cache => {

        for(const url of APP_SHELL){

          try{

            const response =
              await fetch(
                new Request(
                  url,
                  {
                    cache:"no-store"
                  }
                )
              );

            /*
            Solo guardamos respuestas HTTP
            correctas y no redireccionadas.
            */

            if(
              response &&
              response.status === 200 &&
              response.type === "basic"
            ){

              await cache.put(
                url,
                response.clone()
              );

              console.log(
                "[SW] Cache guardada:",
                url
              );

            }else{

              console.log(
                "[SW] No se guardó:",
                url,
                response
              );

            }

          }catch(error){

            console.log(
              "[SW] Error cacheando:",
              url,
              error
            );

          }

        }

      })

  );

});


/*
=========================================================
 ACTIVACIÓN
=========================================================
*/

self.addEventListener("activate", event => {

  console.log(
    "[SW] Activando:",
    CACHE_NAME
  );

  event.waitUntil(

    caches.keys()
      .then(keys => {

        return Promise.all(

          keys.map(key => {

            if(key !== CACHE_NAME){

              console.log(
                "[SW] Eliminando caché antigua:",
                key
              );

              return caches.delete(key);

            }

            return null;

          })

        );

      })
      .then(() => {

        return self.clients.claim();

      })

  );

});


/*
=========================================================
 FUNCIÓN PARA DETERMINAR SI ES STREAM
=========================================================
*/

function isStreamingRequest(url){

  const pathname =
    url.pathname.toLowerCase();

  const hostname =
    url.hostname.toLowerCase();


  return (

    pathname.endsWith(".mpd") ||

    pathname.endsWith(".m3u8") ||

    pathname.includes(".m4s") ||

    pathname.endsWith(".ts") ||

    hostname.includes("cloudfront.net") ||

    hostname.includes("drm") ||

    hostname.includes("widevine")

  );

}


/*
=========================================================
 FUNCIÓN PARA DETERMINAR SI ES RECURSO DE LA APP
=========================================================
*/

function isSameOrigin(url){

  return (
    url.origin === self.location.origin
  );

}


/*
=========================================================
 FETCH
=========================================================
*/

self.addEventListener("fetch", event => {

  const request =
    event.request;

  const url =
    new URL(request.url);


  /*
  -------------------------------------------------------
  1. Solo GET
  -------------------------------------------------------
  */

  if(request.method !== "GET"){

    return;

  }


  /*
  -------------------------------------------------------
  2. STREAMS
  -------------------------------------------------------

  NO utilizamos caché para:

  MPD
  M3U8
  M4S
  TS
  CloudFront
  DRM
  Widevine
  */

  if(isStreamingRequest(url)){

    event.respondWith(

      fetch(request)
        .catch(error => {

          console.log(
            "[SW] Error de streaming:",
            error
          );

          throw error;

        })

    );

    return;

  }


  /*
  -------------------------------------------------------
  3. RECURSOS EXTERNOS
  -------------------------------------------------------

  No intentamos controlar desde este Service Worker
  los recursos de otros dominios.

  Esto incluye:

  Google
  jsDelivr
  GitHub raw
  i.ibb.co
  etc.
  */

  if(!isSameOrigin(url)){

    return;

  }


  /*
  -------------------------------------------------------
  4. NAVEGACIÓN
  -------------------------------------------------------

  Para páginas HTML:

  NETWORK FIRST

  Primero intentamos obtener la versión actual
  desde Cloudflare.

  Si no hay Internet, utilizamos la copia local
  de la PWA.
  */

  if(request.mode === "navigate"){

    event.respondWith(

      fetch(request)
        .then(response => {

          /*
          Solo guardamos respuestas 200.
          */

          if(
            response &&
            response.status === 200 &&
            response.type === "basic"
          ){

            const copy =
              response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {

                cache.put(
                  "/",
                  copy
                );

              });

          }

          return response;

        })
        .catch(() => {

          return caches.match(
            "/"
          );

        })

    );

    return;

  }


  /*
  -------------------------------------------------------
  5. MANIFEST
  -------------------------------------------------------
  */

  if(
    url.pathname === "/manifest.json"
  ){

    event.respondWith(

      fetch(request)
        .then(response => {

          if(
            response &&
            response.status === 200 &&
            response.type === "basic"
          ){

            const copy =
              response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {

                cache.put(
                  "/manifest.json",
                  copy
                );

              });

          }

          return response;

        })
        .catch(() => {

          return caches.match(
            "/manifest.json"
          );

        })

    );

    return;

  }


  /*
  -------------------------------------------------------
  6. OTROS ARCHIVOS DEL MISMO DOMINIO
  -------------------------------------------------------

  Para CSS, JS, imágenes, etc.:

  Primero red.

  Si falla, buscamos caché.

  */

  event.respondWith(

    fetch(request)
      .then(response => {

        /*
        Solamente guardamos respuestas válidas.
        */

        if(
          response &&
          response.status === 200 &&
          response.type === "basic"
        ){

          const copy =
            response.clone();

          caches.open(CACHE_NAME)
            .then(cache => {

              cache.put(
                request,
                copy
              );

            });

        }

        return response;

      })
      .catch(() => {

        return caches.match(
          request
        );

      })

  );

});