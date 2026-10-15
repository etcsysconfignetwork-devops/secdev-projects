
/* =========================================================
   XSPORTS PWA - SERVICE WORKER
   Versión 2
========================================================= */

const CACHE_NAME = "xsports-v2";
const CACHE_PREFIX = "xsports-";

const APP_FILES = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json",
    "./users.json",
    "./events.json"
];

/* =========================================================
   DETECTAR SOLICITUDES DE STREAMING
========================================================= */

function isStreamRequest(url) {
    const pathname = url.pathname.toLowerCase();
    const fullUrl = url.href.toLowerCase();

    return (
        /\.(m3u8|mpd|ts|m4s|mp4|m4v|key)$/.test(pathname) ||
        /\/(license|licence|drm)(\/|$)/.test(pathname) ||
        /[?&](license|licence|drm)=/.test(fullUrl)
    );
}

/* =========================================================
   INSTALACIÓN
========================================================= */

self.addEventListener("install", event => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);

            // Precargar los archivos esenciales.
            await cache.addAll(APP_FILES);

            // Activar la nueva versión cuando esté instalada.
            await self.skipWaiting();
        })()
    );
});

/* =========================================================
   ACTIVACIÓN
========================================================= */

self.addEventListener("activate", event => {
    event.waitUntil(
        (async () => {
            const cacheNames = await caches.keys();

            await Promise.all(
                cacheNames
                    .filter(name =>
                        name.startsWith(CACHE_PREFIX) &&
                        name !== CACHE_NAME
                    )
                    .map(name => caches.delete(name))
            );

            // Controlar las páginas abiertas.
            await self.clients.claim();
        })()
    );
});

/* =========================================================
   FETCH - CONTROL DE SOLICITUDES
========================================================= */

self.addEventListener("fetch", event => {
    const request = event.request;

    // Solo gestionar solicitudes GET.
    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);

    // No interceptar otros dominios.
    if (url.origin !== self.location.origin) {
        return;
    }

    // No almacenar transmisiones ni solicitudes DRM.
    if (isStreamRequest(url)) {
        return;
    }

    /* -----------------------------------------------------
       NAVEGACIÓN: RED PRIMERO, CACHÉ SI FALLA
    ----------------------------------------------------- */

    if (request.mode === "navigate") {
        event.respondWith(
            (async () => {
                try {
                    return await fetch(request, {
                        cache: "no-cache"
                    });
                } catch (error) {
                    return (
                        await caches.match("./index.html")
                    ) || Response.error();
                }
            })()
        );

        return;
    }

    /* -----------------------------------------------------
       ARCHIVOS DE LA APP Y JSON: RED PRIMERO
    ----------------------------------------------------- */

    const isAppResource =
        /\.(html|css|js|json|webmanifest|png|jpe?g|svg|webp|ico|woff2?)$/i
            .test(url.pathname);

    if (!isAppResource) {
        return;
    }

    event.respondWith(
        (async () => {
            try {
                const response = await fetch(request, {
                    cache: "no-cache"
                });

                // Guardar únicamente respuestas correctas.
                if (response.ok && response.status === 200) {
                    const cache = await caches.open(CACHE_NAME);

                    await cache.put(
                        request,
                        response.clone()
                    );
                }

                return response;
            } catch (error) {
                // Sin conexión: utilizar la versión guardada.
                const cachedResponse =
                    await caches.match(request);

                if (cachedResponse) {
                    return cachedResponse;
                }

                return Response.error();
            }
        })()
    );
});
