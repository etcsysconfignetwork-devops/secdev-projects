/* =========================================================
   XSPORTS
   JAVASCRIPT PRINCIPAL
   HLS.js + SHAKA + MPD/DRM
========================================================= */

"use strict";


/* =========================================================
   CONFIGURACIÓN
========================================================= */

const USERS_URL =
    "https://raw.githubusercontent.com/etcsysconfignetwork-devops/secdev-projects/main/users.json";

const EVENTS_URL =
    "https://raw.githubusercontent.com/etcsysconfignetwork-devops/secdev-projects/main/events.json";

const SESSION_KEY = "xsports_session";


/*
   Tiempo máximo inicial para HLS.js
   antes de intentar recuperación/fallback.
*/
const HLS_START_TIMEOUT = 5500;


/*
   Cantidad máxima de recuperaciones HLS
   durante el inicio.
*/
const MAX_HLS_RECOVERIES = 2;


let users = [];
let events = [];

let hlsPlayer = null;
let shakaPlayer = null;

let deferredInstallPrompt = null;


/*
   Identificador de reproducción.

   Sirve para evitar que un reproductor viejo
   continúe actuando cuando abrimos otro evento.
*/
let playbackSession = 0;


/*
   Timer utilizado para detectar que un
   stream HLS no consiguió iniciar.
*/
let hlsStartTimer = null;


/*
   Cantidad de recuperaciones realizadas
   para el stream actual.
*/
let hlsRecoveryAttempts = 0;


/*
   Evita ejecutar el fallback varias veces.
*/
let hlsFallbackStarted = false;


/*
   URL actual.
*/
let currentStreamUrl = "";


/* =========================================================
   ELEMENTOS
========================================================= */

const loginScreen =
    document.getElementById("loginScreen");

const eventsScreen =
    document.getElementById("eventsScreen");

const playerScreen =
    document.getElementById("playerScreen");

const usernameInput =
    document.getElementById("username");

const passwordInput =
    document.getElementById("password");

const loginButton =
    document.getElementById("loginButton");

const loginError =
    document.getElementById("loginError");

const logoutButton =
    document.getElementById("logoutButton");

const installButton =
    document.getElementById("installButton");

const eventsGrid =
    document.getElementById("eventsGrid");

const eventCounter =
    document.getElementById("eventCounter");

const backButton =
    document.getElementById("backButton");

const video =
    document.getElementById("videoPlayer");

const playerTitle =
    document.getElementById("playerTitle");

const playerLoading =
    document.getElementById("playerLoading");

const playerError =
    document.getElementById("playerError");


/* =========================================================
   INICIO
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    init
);


async function init() {

    registerServiceWorker();

    setupInstallPrompt();

    await loadUsers();

    await loadEvents();

    checkExistingSession();

    setupControls();

}


/* =========================================================
   SERVICE WORKER
========================================================= */

function registerServiceWorker() {

    if ("serviceWorker" in navigator) {

        window.addEventListener(
            "load",
            () => {

                navigator.serviceWorker
                    .register("./service-worker.js")
                    .catch(error => {

                        console.error(
                            "Service Worker:",
                            error
                        );

                    });

            }
        );

    }

}


/* =========================================================
   CARGAR USUARIOS
========================================================= */

async function loadUsers() {

    try {

        const response =
            await fetch(
                USERS_URL + "?v=" + Date.now(),
                {
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                "No se pudo cargar users.json"
            );

        }


        users =
            await response.json();

    } catch (error) {

        console.error(
            "Users JSON:",
            error
        );


        if (loginError) {

            loginError.textContent =
                "No se pudo cargar la información de usuarios.";

        }

    }

}


/* =========================================================
   CARGAR EVENTOS
========================================================= */

async function loadEvents() {

    try {

        const response =
            await fetch(
                EVENTS_URL + "?v=" + Date.now(),
                {
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                "No se pudo cargar events.json"
            );

        }


        events =
            await response.json();


        renderEvents();

    } catch (error) {

        console.error(
            "Events JSON:",
            error
        );


        if (eventsGrid) {

            eventsGrid.innerHTML = `
                <div style="
                    grid-column:1/-1;
                    text-align:center;
                    padding:40px;
                    color:#ff4444;
                ">
                    No se pudieron cargar los eventos.
                </div>
            `;

        }

    }

}


/* =========================================================
   LOGIN
========================================================= */

if (loginButton) {

    loginButton.addEventListener(
        "click",
        login
    );

}


if (passwordInput) {

    passwordInput.addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {

                login();

            }

        }
    );

}


if (usernameInput) {

    usernameInput.addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {

                if (passwordInput) {

                    passwordInput.focus();

                }

            }

        }
    );

}


function login() {

    const username =
        usernameInput.value.trim();

    const password =
        passwordInput.value;


    loginError.textContent = "";


    if (!username || !password) {

        loginError.textContent =
            "Ingrese usuario y contraseña.";

        return;

    }


    const user =
        users.find(
            item =>
                String(item.username) === username &&
                String(item.password) === password
        );


    if (!user) {

        loginError.textContent =
            "Usuario o contraseña incorrectos.";

        return;

    }


    if (isExpired(user.expire)) {

        loginError.textContent =
            "La cuenta se encuentra vencida.";

        return;

    }


    const session = {

        username:
            user.username,

        expire:
            user.expire,

        loginTime:
            Date.now()

    };


    localStorage.setItem(
        SESSION_KEY,
        JSON.stringify(session)
    );


    showEvents();

}


/* =========================================================
   COMPROBAR FECHA
========================================================= */

function isExpired(expireDate) {

    if (!expireDate) {

        return false;

    }


    const expiration =
        new Date(
            `${expireDate}T23:59:59`
        );


    return Date.now() >
        expiration.getTime();

}


/* =========================================================
   SESIÓN EXISTENTE
========================================================= */

function checkExistingSession() {

    const sessionData =
        localStorage.getItem(
            SESSION_KEY
        );


    if (!sessionData) {

        showLogin();

        return;

    }


    try {

        const session =
            JSON.parse(
                sessionData
            );


        if (
            !session.username ||
            isExpired(session.expire)
        ) {

            forceLogout();

            return;

        }


        const currentUser =
            users.find(
                item =>
                    String(item.username) ===
                    String(session.username)
            );


        if (
            !currentUser ||
            isExpired(currentUser.expire)
        ) {

            forceLogout();

            return;

        }


        showEvents();

    } catch {

        forceLogout();

    }

}


/* =========================================================
   CIERRE AUTOMÁTICO
========================================================= */

function checkSessionExpiration() {

    const data =
        localStorage.getItem(
            SESSION_KEY
        );


    if (!data) {

        return;

    }


    try {

        const session =
            JSON.parse(data);


        if (
            isExpired(session.expire)
        ) {

            alert(
                "Tu cuenta ha vencido."
            );


            forceLogout();

        }

    } catch {

        forceLogout();

    }

}


setInterval(
    checkSessionExpiration,
    30000
);


/* =========================================================
   MOSTRAR LOGIN
========================================================= */

function showLogin() {

    loginScreen.classList.remove(
        "hidden"
    );

    eventsScreen.classList.add(
        "hidden"
    );

    playerScreen.classList.add(
        "hidden"
    );

}


/* =========================================================
   MOSTRAR EVENTOS
========================================================= */

function showEvents() {

    loginScreen.classList.add(
        "hidden"
    );

    eventsScreen.classList.remove(
        "hidden"
    );

    playerScreen.classList.add(
        "hidden"
    );


    renderEvents();

}


/* =========================================================
   LOGOUT
========================================================= */

if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        () => {

            forceLogout();

        }
    );

}


function forceLogout() {

    localStorage.removeItem(
        SESSION_KEY
    );


    stopPlayer();


    usernameInput.value = "";
    passwordInput.value = "";


    showLogin();


    setTimeout(
        () => {

            if (usernameInput) {

                usernameInput.focus();

            }

        },
        100
    );

}


/* =========================================================
   CREAR EVENTOS
========================================================= */

function renderEvents() {

    if (!eventsGrid) {

        return;

    }


    eventsGrid.innerHTML = "";


    if (eventCounter) {

        eventCounter.textContent =
            `${events.length} eventos`;

    }


    events.forEach(
        (event, index) => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "event-card";


            card.tabIndex = 0;


            card.dataset.index =
                index;


            let iconHTML = "";


            if (event.icon) {

                iconHTML = `
                    <img
                        src="${escapeAttribute(event.icon)}"
                        alt=""
                        loading="lazy"
                        onerror="this.style.display='none'"
                    >
                `;

            } else {

                iconHTML = `
                    <div class="event-icon-placeholder">
                        X
                    </div>
                `;

            }


            card.innerHTML = `

                <div class="event-icon">

                    ${iconHTML}

                </div>

                <div class="event-name">

                    ${escapeHTML(
                        event.name ||
                        `Evento ${index + 1}`
                    )}

                </div>

            `;


            card.addEventListener(
                "click",
                () => {

                    openEvent(event);

                }
            );


            card.addEventListener(
                "keydown",
                eventKey => {

                    if (
                        eventKey.key ===
                        "Enter"
                    ) {

                        openEvent(event);

                    }

                }
            );


            eventsGrid.appendChild(
                card
            );

        }
    );


    focusFirstEvent();

}


/* =========================================================
   ABRIR EVENTO
========================================================= */

async function openEvent(event) {

    if (!event.url) {

        alert(
            "Este evento todavía no tiene una transmisión configurada."
        );

        return;

    }


    /*
       Cada evento recibe una nueva sesión.
    */

    const sessionId =
        ++playbackSession;


    eventsScreen.classList.add(
        "hidden"
    );


    playerScreen.classList.remove(
        "hidden"
    );


    playerTitle.textContent =
        event.name || "Xsports";


    playerError.textContent = "";


    showPlayerLoading(
        "Accediendo al servidor..."
    );


    try {

        if (
            String(event.type)
                .toLowerCase()
                === "mpd"
        ) {

            await playMPD(
                event,
                sessionId
            );

        } else {

            await playM3U8(
                event,
                sessionId
            );

        }

    } catch (error) {

        /*
           Si ya se abrió otro evento,
           ignoramos este error viejo.
        */

        if (
            sessionId !== playbackSession
        ) {

            return;

        }


        console.error(
            "Error iniciando evento:",
            error
        );


        hidePlayerLoading();


        playerError.textContent =
            getFriendlyPlaybackError(
                error
            );

    }

}


/* =========================================================
   M3U8 / HLS
========================================================= */

async function playM3U8(
    event,
    sessionId
) {

    stopPlayer();


    currentStreamUrl =
        String(event.url).trim();


    hlsRecoveryAttempts = 0;

    hlsFallbackStarted = false;


    if (!currentStreamUrl) {

        throw new Error(
            "URL M3U8 vacía."
        );

    }


    console.log(
        "===================================="
    );

    console.log(
        "XSPORTS HLS"
    );

    console.log(
        "URL:",
        currentStreamUrl
    );

    console.log(
        "===================================="
    );


    /*
       -----------------------------------------------------
       1. HLS.js
       -----------------------------------------------------

       En Chrome / Android / Android TV normalmente
       será el método principal.
    */

    if (
        typeof Hls !== "undefined" &&
        Hls.isSupported()
    ) {

        console.log(
            "HLS.js disponible. Iniciando..."
        );


        await startHlsJs(
            currentStreamUrl,
            sessionId
        );


        return;

    }


    /*
       -----------------------------------------------------
       2. HLS NATIVO
       -----------------------------------------------------
    */

    if (
        video.canPlayType(
            "application/vnd.apple.mpegurl"
        )
    ) {

        console.log(
            "Utilizando HLS nativo."
        );


        await startNativeHls(
            currentStreamUrl,
            sessionId
        );


        return;

    }


    /*
       -----------------------------------------------------
       3. SHAKA COMO ÚLTIMA OPCIÓN
       -----------------------------------------------------
    */

    console.log(
        "HLS.js no disponible."
    );


    await startShakaForHls(
        currentStreamUrl,
        sessionId
    );

}


/* =========================================================
   HLS.JS
========================================================= */

function startHlsJs(
    url,
    sessionId
) {

    return new Promise(
        (resolve, reject) => {

            if (
                sessionId !== playbackSession
            ) {

                reject(
                    new Error(
                        "Sesión de reproducción cancelada."
                    )
                );

                return;

            }


            if (
                typeof Hls === "undefined" ||
                !Hls.isSupported()
            ) {

                reject(
                    new Error(
                        "HLS.js no está disponible."
                    )
                );

                return;

            }


            clearHlsStartTimer();


            hlsRecoveryAttempts = 0;

            hlsFallbackStarted = false;


            hlsPlayer =
                new Hls({

                    enableWorker: true,

                    lowLatencyMode: true,

                    backBufferLength: 30,

                    maxBufferLength: 30,

                    maxMaxBufferLength: 60,

                    liveSyncDurationCount: 3,

                    liveMaxLatencyDurationCount: 6,

                    manifestLoadingMaxRetry: 2,

                    manifestLoadingRetryDelay: 1000,

                    levelLoadingMaxRetry: 2,

                    levelLoadingRetryDelay: 1000,

                    fragLoadingMaxRetry: 3,

                    fragLoadingRetryDelay: 1000

                });


            let started = false;


            /*
               ------------------------------------------------
               VIDEO EVENTS
               ------------------------------------------------
            */

            const onPlaying =
                () => {

                    if (
                        sessionId !== playbackSession
                    ) {

                        return;

                    }


                    started = true;


                    clearHlsStartTimer();


                    hidePlayerLoading();


                    console.log(
                        "HLS reproduciendo correctamente."
                    );

                };


            const onWaiting =
                () => {

                    if (
                        !started
                    ) {

                        showPlayerLoading(
                            "Accediendo al servidor..."
                        );

                    }

                };


            const onVideoError =
                () => {

                    if (
                        sessionId !== playbackSession
                    ) {

                        return;

                    }


                    console.error(
                        "VIDEO ERROR:",
                        video.error
                    );

                };


            video.addEventListener(
                "playing",
                onPlaying
            );


            video.addEventListener(
                "waiting",
                onWaiting
            );


            video.addEventListener(
                "error",
                onVideoError
            );


            /*
               ------------------------------------------------
               MEDIA ATTACHED
               ------------------------------------------------
            */

            hlsPlayer.on(
                Hls.Events.MEDIA_ATTACHED,
                () => {

                    if (
                        sessionId !==