const CACHE_NAME = "xsports-v1";

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
   INSTALACIÓN
========================================================= */

self.addEventListener(
    "install",
    event => {

        event.waitUntil(

            caches
                .open(CACHE_NAME)
                .then(
                    cache =>
                        cache.addAll(
                            APP_FILES
                        )
                )

        );

        self.skipWaiting();

    }
);


/* =========================================================
   ACTIVACIÓN
========================================================= */

self.addEventListener(
    "activate",
    event => {

        event.waitUntil(

            caches
                .keys()
                .then(
                    cacheNames => {

                        return Promise.all(

                            cacheNames
                                .filter(
                                    cacheName =>
                                        cacheName !==
                                        CACHE_NAME
                                )
                                .map(
                                    cacheName =>
                                        caches.delete(
                                            cacheName
                                        )
                                )

                        );

                    }
                )

        );

        self.clients.claim();

    }
);


/* =========================================================
   FETCH
========================================================= */

self.addEventListener(
    "fetch",
    event => {

        const request =
            event.request;


        /*
           No interceptar streams.

           Es importante para no intentar
           almacenar M3U8/segmentos/DRM
           dentro de la caché de la PWA.
        */

        const url =
            request.url;


        const isStream =
            url.includes(".m3u8") ||
            url.includes(".mpd") ||
            url.includes(".ts") ||
            url.includes(".m4s") ||
            url.includes(".mp4") ||
            url.includes("license") ||
            url.includes("manifest");


        if (isStream) {

            return;

        }


        /*
           Para archivos de la aplicación:

           Network first.

           Esto permite actualizar
           users.json y events.json.
        */

        event.respondWith(

            fetch(request)

                .then(
                    response => {

                        if (
                            response &&
                            response.status === 200
                        ) {

                            const copy =
                                response.clone();

                            caches
                                .open(
                                    CACHE_NAME
                                )
                                .then(
                                    cache =>
                                        cache.put(
                                            request,
                                            copy
                                        )
                                );

                        }

                        return response;

                    }
                )

                .catch(
                    () =>
                        caches.match(
                            request
                        )
                )

        );

    }
);