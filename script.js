/* =========================================================
   XSPORTS
   JAVASCRIPT PRINCIPAL
========================================================= */

"use strict";


/* =========================================================
   CONFIGURACIÓN
========================================================= */

const USERS_URL = "https://raw.githubusercontent.com/etcsysconfignetwork-devops/secdev-projects/main/users.json";
const EVENTS_URL = "https://raw.githubusercontent.com/etcsysconfignetwork-devops/secdev-projects/main/events.json";

const SESSION_KEY = "xsports_session";

let users = [];
let events = [];

let hlsPlayer = null;
let shakaPlayer = null;

let deferredInstallPrompt = null;


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
                USERS_URL + "?v=" + Date.now()
            );

        if (!response.ok) {

            throw new Error(
                "No se pudo cargar users.json"
            );

        }

        users =
            await response.json();

    } catch (error) {

        console.error(error);

        loginError.textContent =
            "No se pudo cargar la información de usuarios.";

    }

}


/* =========================================================
   CARGAR EVENTOS
========================================================= */

async function loadEvents() {

    try {

        const response =
            await fetch(
                EVENTS_URL + "?v=" + Date.now()
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

        console.error(error);

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


/* =========================================================
   LOGIN
========================================================= */

loginButton.addEventListener(
    "click",
    login
);


passwordInput.addEventListener(
    "keydown",
    event => {

        if (event.key === "Enter") {

            login();

        }

    }
);


usernameInput.addEventListener(
    "keydown",
    event => {

        if (event.key === "Enter") {

            passwordInput.focus();

        }

    }
);


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


    /*
       Se interpreta la fecha de vencimiento
       hasta las 23:59:59 de ese día.
    */

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


        /*
           Comprobamos también el usuario
           actual del JSON.
        */

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


/*
   Comprobación cada 30 segundos.
*/

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

logoutButton.addEventListener(
    "click",
    () => {

        forceLogout();

    }
);


function forceLogout() {

    localStorage.removeItem(
        SESSION_KEY
    );

    stopPlayer();

    usernameInput.value = "";
    passwordInput.value = "";

    showLogin();

    setTimeout(
        () => usernameInput.focus(),
        100
    );

}


/* =========================================================
   CREAR EVENTOS
========================================================= */

function renderEvents() {

    eventsGrid.innerHTML = "";

    eventCounter.textContent =
        `${events.length} eventos`;


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
                    >
                `;

            } else {

                iconHTML = `
                    <div
                        class="event-icon-placeholder"
                    >
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

                <div class="event-type">

                    ${escapeHTML(
                        event.type ||
                        "M3U8"
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


    eventsScreen.classList.add(
        "hidden"
    );

    playerScreen.classList.remove(
        "hidden"
    );


    playerTitle.textContent =
        event.name || "Xsports";


    playerError.textContent = "";

    playerLoading.classList.remove(
        "hidden"
    );


    try {

        if (
            String(event.type)
                .toLowerCase()
                === "mpd"
        ) {

            await playMPD(event);

        } else {

            await playM3U8(event);

        }

    } catch (error) {

        console.error(error);

        playerLoading.classList.add(
            "hidden"
        );

        playerError.textContent =
            "No se pudo iniciar la transmisión.";

    }

}


/* =========================================================
   M3U8 / HLS
========================================================= */

async function playM3U8(event) {

    stopPlayer();

    const url =
        event.url;


    /*
       Android / navegadores con HLS nativo.
    */

    if (
        video.canPlayType(
            "application/vnd.apple.mpegurl"
        )
    ) {

        video.src = url;

        video.addEventListener(
            "loadedmetadata",
            () => {

                playerLoading.classList.add(
                    "hidden"
                );

                video.play().catch(() => {});

            },
            { once: true }
        );

        video.load();

        return;

    }


    /*
       Chrome / Android TV / otros
       mediante HLS.js.
    */

    if (
        typeof Hls !== "undefined" &&
        Hls.isSupported()
    ) {

        hlsPlayer =
            new Hls({

                enableWorker: true,

                lowLatencyMode: true,

                backBufferLength: 30,

                maxBufferLength: 30

            });


        hlsPlayer.loadSource(
            url
        );


        hlsPlayer.attachMedia(
            video
        );


        hlsPlayer.on(
            Hls.Events.MANIFEST_PARSED,
            () => {

                playerLoading.classList.add(
                    "hidden"
                );

                video.play().catch(() => {});

            }
        );


        hlsPlayer.on(
            Hls.Events.ERROR,
            (eventName, data) => {

                console.error(
                    "HLS:",
                    data
                );

                if (
                    data.fatal
                ) {

                    playerError.textContent =
                        "Error en la transmisión HLS.";

                }

            }
        );


        return;

    }


    throw new Error(
        "Este dispositivo no soporta HLS."
    );

}


/* =========================================================
   MPD / DASH + DRM
========================================================= */

async function playMPD(event) {

    stopPlayer();


    if (
        typeof shaka === "undefined"
    ) {

        throw new Error(
            "Shaka Player no está disponible."
        );

    }


    shaka.polyfill.installAll();


    if (
        !shaka.Player.isBrowserSupported()
    ) {

        throw new Error(
            "El navegador no soporta DASH."
        );

    }


    shakaPlayer =
        new shaka.Player(
            video
        );


    /*
       Configuración DRM.

       events.json puede contener:

       "drm": {
           "type": "widevine",
           "licenseUrl": "https://..."
       }

       o:

       "drm": {
           "type": "clearkey",
           "licenseUrl": "https://..."
       }
    */

    if (
        event.drm &&
        event.drm.licenseUrl
    ) {

        const drmType =
            String(
                event.drm.type || ""
            ).toLowerCase();


        if (
            drmType === "widevine"
        ) {

            shakaPlayer.configure({

                drm: {

                    servers: {

                        "com.widevine.alpha":
                            event.drm.licenseUrl

                    }

                }

            });

        }


        if (
            drmType === "clearkey"
        ) {

            shakaPlayer.configure({

                drm: {

                    servers: {

                        "org.w3.clearkey":
                            event.drm.licenseUrl

                    }

                }

            });

        }


        if (
            drmType === "fairplay"
        ) {

            console.warn(
                "FairPlay requiere configuración específica de Safari."
            );

        }

    }


    shakaPlayer.addEventListener(
        "error",
        eventError => {

            console.error(
                "Shaka error:",
                eventError.detail
            );

            playerError.textContent =
                "Error en el reproductor MPD/DRM.";

        }
    );


    await shakaPlayer.load(
        event.url
    );


    playerLoading.classList.add(
        "hidden"
    );


    await video.play();

}


/* =========================================================
   DETENER REPRODUCTOR
========================================================= */

function stopPlayer() {

    if (hlsPlayer) {

        try {

            hlsPlayer.destroy();

        } catch {}

        hlsPlayer = null;

    }


    if (shakaPlayer) {

        try {

            shakaPlayer.destroy();

        } catch {}

        shakaPlayer = null;

    }


    video.pause();

    video.removeAttribute(
        "src"
    );

    video.load();

}


/* =========================================================
   VOLVER A EVENTOS
========================================================= */

backButton.addEventListener(
    "click",
    () => {

        stopPlayer();

        playerScreen.classList.add(
            "hidden"
        );

        eventsScreen.classList.remove(
            "hidden"
        );

        focusFirstEvent();

    }
);


/* =========================================================
   CONTROLES ANDROID TV
========================================================= */

function setupControls() {

    document.addEventListener(
        "keydown",
        handleTVNavigation
    );

}


function handleTVNavigation(event) {

    if (
        eventsScreen.classList.contains(
            "hidden"
        )
    ) {

        return;

    }


    const cards =
        [
            ...document.querySelectorAll(
                ".event-card"
            )
        ];


    if (!cards.length) {

        return;

    }


    const current =
        document.activeElement;


    if (
        !current.classList.contains(
            "event-card"
        )
    ) {

        cards[0].focus();

        return;

    }


    const currentIndex =
        cards.indexOf(current);


    const columns =
        getGridColumns();


    let nextIndex =
        currentIndex;


    switch (event.key) {

        case "ArrowRight":

            nextIndex =
                currentIndex + 1;

            break;


        case "ArrowLeft":

            nextIndex =
                currentIndex - 1;

            break;


        case "ArrowDown":

            nextIndex =
                currentIndex + columns;

            break;


        case "ArrowUp":

            nextIndex =
                currentIndex - columns;

            break;


        case "Enter":

            current.click();

            return;


        default:

            return;

    }


    event.preventDefault();


    if (
        nextIndex >= 0 &&
        nextIndex < cards.length
    ) {

        cards[nextIndex].focus();

    }

}


function getGridColumns() {

    const grid =
        document.getElementById(
            "eventsGrid"
        );

    const style =
        getComputedStyle(grid);

    const columns =
        style
            .gridTemplateColumns
            .split(" ")
            .length;

    return Math.max(
        1,
        columns
    );

}


function focusFirstEvent() {

    const first =
        document.querySelector(
            ".event-card"
        );

    if (first) {

        setTimeout(
            () => first.focus(),
            100
        );

    }

}


/* =========================================================
   PWA INSTALLACIÓN
========================================================= */

function setupInstallPrompt() {

    window.addEventListener(
        "beforeinstallprompt",
        event => {

            event.preventDefault();

            deferredInstallPrompt =
                event;

            installButton.classList.remove(
                "hidden"
            );

        }
    );


    installButton.addEventListener(
        "click",
        async () => {

            if (!deferredInstallPrompt) {

                return;

            }


            deferredInstallPrompt.prompt();


            await deferredInstallPrompt.userChoice;


            deferredInstallPrompt = null;

            installButton.classList.add(
                "hidden"
            );

        }
    );


    window.addEventListener(
        "appinstalled",
        () => {

            installButton.classList.add(
                "hidden"
            );

        }
    );

}


/* =========================================================
   SEGURIDAD BÁSICA HTML
========================================================= */

function escapeHTML(value) {

    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


function escapeAttribute(value) {

    return escapeHTML(value);

}