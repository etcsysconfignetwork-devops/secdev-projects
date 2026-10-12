"use strict";

/* =========================================================
   CONFIGURACIÓN
========================================================= */

const USERS_URL =
    "https://raw.githubusercontent.com/etcsysconfignetwork-devops/secdev-projects/main/users.json";

const EVENTS_URL =
    "https://raw.githubusercontent.com/etcsysconfignetwork-devops/secdev-projects/main/events.json";

const SESSION_KEY = "xsports_session";

// Tiempos de reproducción
const HLS_FALLBACK_TIMEOUT = 6000;
const PLAYER_START_TIMEOUT = 18000;

// Reintentos de recuperación
const MAX_NETWORK_RECOVERY = 3;
const MAX_MEDIA_RECOVERY = 2;


/* =========================================================
   ELEMENTOS HTML
========================================================= */

const loginScreen = document.getElementById("loginScreen");
const eventsScreen = document.getElementById("eventsScreen");
const playerScreen = document.getElementById("playerScreen");

const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");

const loginButton = document.getElementById("loginButton");
const loginError = document.getElementById("loginError");

const logoutButton = document.getElementById("logoutButton");
const installButton = document.getElementById("installButton");

const eventsGrid = document.getElementById("eventsGrid");
const eventCounter = document.getElementById("eventCounter");

const backButton = document.getElementById("backButton");
const playerTitle = document.getElementById("playerTitle");
const videoPlayer = document.getElementById("videoPlayer");

const playerLoading = document.getElementById("playerLoading");
const playerError = document.getElementById("playerError");


/* =========================================================
   ESTADO DE LA APLICACIÓN
========================================================= */

let users = [];
let events = [];

let currentUser = null;
let currentEvent = null;

let hlsPlayer = null;
let shakaPlayer = null;

let deferredInstallPrompt = null;

let playerOperationId = 0;
let playerStartupTimer = null;
let playerRetryTimer = null;

let playerIsLoading = false;
let playerHasStarted = false;


/* =========================================================
   INICIALIZACIÓN
========================================================= */

document.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
    registerServiceWorker();
    setupInstallButton();
    setupKeyboardNavigation();
    setupEventListeners();

    if (!videoPlayer) {
        console.error("No se encontró el elemento videoPlayer.");
    }

    if (
        window.shaka &&
        shaka.polyfill &&
        typeof shaka.polyfill.installAll === "function"
    ) {
        try {
            shaka.polyfill.installAll();
        } catch (error) {
            console.error("Error al instalar polyfills de Shaka:", error);
        }
    }

    const libraries = checkPlayerLibraries();

    if (!libraries.hls && !libraries.shaka) {
        console.warn(
            "No se ha podido detectar HLS.js ni Shaka Player. " +
            "Comprueba las URL de las bibliotecas."
        );
    }

    await loadApplicationData();
}


/* =========================================================
   COMPROBAR BIBLIOTECAS
========================================================= */

function checkPlayerLibraries() {
    return {
        hls: typeof window.Hls !== "undefined",
        shaka: typeof window.shaka !== "undefined"
    };
}


/* =========================================================
   SERVICE WORKER
========================================================= */

async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
        return;
    }

    try {
        await navigator.serviceWorker.register("./service-worker.js");
        console.log("Service Worker registrado.");
    } catch (error) {
        console.warn("No se pudo registrar el Service Worker:", error);
    }
}


/* =========================================================
   EVENTOS DE LA INTERFAZ
========================================================= */

function setupEventListeners() {
    loginButton?.addEventListener("click", login);

    passwordInput?.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            login();
        }
    });

    usernameInput?.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            passwordInput?.focus();
        }
    });

    logoutButton?.addEventListener("click", logout);

    backButton?.addEventListener("click", returnToEvents);

    eventsGrid?.addEventListener("click", function (event) {
        const card = event.target.closest("[data-event-index]");

        if (!card) {
            return;
        }

        const index = Number(card.dataset.eventIndex);

        if (!Number.isInteger(index) || !events[index]) {
            return;
        }

        openEvent(events[index]);
    });

    eventsGrid?.addEventListener("keydown", function (event) {
        const card = event.target.closest("[data-event-index]");

        if (!card) {
            return;
        }

        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();

            const index = Number(card.dataset.eventIndex);

            if (Number.isInteger(index) && events[index]) {
                openEvent(events[index]);
            }
        }
    });
}


/* =========================================================
   CARGA DE USUARIOS Y EVENTOS
========================================================= */

async function loadApplicationData() {
    try {
        const [usersResponse, eventsResponse] = await Promise.all([
            fetch(USERS_URL, { cache: "no-store" }),
            fetch(EVENTS_URL, { cache: "no-store" })
        ]);

        if (!usersResponse.ok) {
            throw new Error(
                `No se pudieron cargar los usuarios (${usersResponse.status}).`
            );
        }

        if (!eventsResponse.ok) {
            throw new Error(
                `No se pudieron cargar los eventos (${eventsResponse.status}).`
            );
        }

        const usersData = await usersResponse.json();
        const eventsData = await eventsResponse.json();

        if (!Array.isArray(usersData)) {
            throw new Error("users.json debe contener una lista de usuarios.");
        }

        if (!Array.isArray(eventsData)) {
            throw new Error("events.json debe contener una lista de eventos.");
        }

        users = usersData;
        events = eventsData;

        renderEvents();

        const session = getSavedSession();

        if (session) {
            const matchedUser = users.find(function (user) {
                return user.username === session.username;
            });

            if (matchedUser && !isUserExpired(matchedUser)) {
                currentUser = matchedUser;
                showEventsScreen();
                return;
            }

            clearSession();
        }

        showLoginScreen();

    } catch (error) {
        console.error("Error cargando los datos:", error);

        showLoginScreen();

        if (loginError) {
            loginError.textContent =
                "No se pudieron cargar los datos. Comprueba tu conexión e inténtalo de nuevo.";
        }
    }
}


/* =========================================================
   LOGIN Y VENCIMIENTO
========================================================= */

function login() {
    const username = usernameInput?.value.trim() || "";
    const password = passwordInput?.value || "";

    if (!username || !password) {
        setLoginError("Introduce tu usuario y contraseña.");
        return;
    }

    const user = users.find(function (item) {
        return (
            String(item.username) === username &&
            String(item.password) === password
        );
    });

    if (!user) {
        setLoginError("Usuario o contraseña incorrectos.");
        return;
    }

    if (isUserExpired(user)) {
        setLoginError("Tu cuenta ha vencido. Contacta con el administrador.");
        return;
    }

    currentUser = user;

    saveSession(user);

    if (passwordInput) {
        passwordInput.value = "";
    }

    setLoginError("");
    showEventsScreen();
}

function isUserExpired(user) {
    if (!user || !user.expire) {
        return false;
    }

    const expiration = String(user.expire).trim();

    // Formato recomendado: YYYY-MM-DD.
    const dateMatch = expiration.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (dateMatch) {
        const year = Number(dateMatch[1]);
        const month = Number(dateMatch[2]);
        const day = Number(dateMatch[3]);

        const endOfExpirationDay = new Date(
            year,
            month - 1,
            day,
            23,
            59,
            59,
            999
        );

        // Rechaza fechas imposibles como 2026-02-31.
        if (
            endOfExpirationDay.getFullYear() !== year ||
            endOfExpirationDay.getMonth() !== month - 1 ||
            endOfExpirationDay.getDate() !== day
        ) {
            return true;
        }

        return Date.now() > endOfExpirationDay.getTime();
    }

    const parsedDate = Date.parse(expiration);

    if (Number.isNaN(parsedDate)) {
        console.warn("Fecha de vencimiento no válida:", expiration);
        return true;
    }

    return Date.now() > parsedDate;
}

function saveSession(user) {
    try {
        localStorage.setItem(
            SESSION_KEY,
            JSON.stringify({
                username: user.username
            })
        );
    } catch (error) {
        console.warn("No se pudo guardar la sesión:", error);
    }
}

function getSavedSession() {
    try {
        const value = localStorage.getItem(SESSION_KEY);

        if (!value) {
            return null;
        }

        const session = JSON.parse(value);

        if (!session || !session.username) {
            return null;
        }

        return session;

    } catch (error) {
        console.warn("Sesión guardada no válida:", error);
        return null;
    }
}

function clearSession() {
    try {
        localStorage.removeItem(SESSION_KEY);
    } catch (error) {
        console.warn("No se pudo borrar la sesión:", error);
    }
}

function logout() {
    clearSession();

    currentUser = null;

    stopPlayer();
    showLoginScreen();

    if (usernameInput) {
        usernameInput.value = "";
    }

    if (passwordInput) {
        passwordInput.value = "";
    }

    setLoginError("");
}

function setLoginError(message) {
    if (loginError) {
        loginError.textContent = message;
    }
}


/* =========================================================
   CAMBIO DE PANTALLAS
========================================================= */

function showLoginScreen() {
    loginScreen?.classList.remove("hidden");
    eventsScreen?.classList.add("hidden");
    playerScreen?.classList.add("hidden");

    if (usernameInput) {
        usernameInput.focus();
    }
}

function showEventsScreen() {
    loginScreen?.classList.add("hidden");
    eventsScreen?.classList.remove("hidden");
    playerScreen?.classList.add("hidden");

    renderEvents();
}

function showPlayerScreen() {
    loginScreen?.classList.add("hidden");
    eventsScreen?.classList.add("hidden");
    playerScreen?.classList.remove("hidden");
}


/* =========================================================
   EVENTOS: RENDERIZADO
========================================================= */

function renderEvents() {
    if (!eventsGrid) {
        return;
    }

    eventsGrid.replaceChildren();

    const availableEvents = events.filter(function (event) {
        return event && typeof event === "object";
    });

    if (eventCounter) {
        eventCounter.textContent =
            `${availableEvents.length} evento${availableEvents.length === 1 ? "" : "s"}`;
    }

    availableEvents.forEach(function (event) {
        const originalIndex = events.indexOf(event);

        const card = document.createElement("div");
        card.className = "event-card";
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("data-event-index", String(originalIndex));

        const icon = document.createElement("img");
        icon.className = "event-icon";
        icon.alt = "";
        icon.loading = "lazy";

        const iconURL = getEventIcon(event);

        if (iconURL) {
            icon.src = iconURL;

            icon.addEventListener("error", function () {
                icon.hidden = true;
            }, { once: true });
        } else {
            icon.hidden = true;
        }

        const name = document.createElement("div");
        name.className = "event-name";
        name.textContent = getEventName(event);

        card.appendChild(icon);
        card.appendChild(name);

        eventsGrid.appendChild(card);
    });
}

function getEventName(event) {
    return String(
        event.name ||
        event.title ||
        event.nombre ||
        "Evento en vivo"
    );
}

function getEventIcon(event) {
    return String(
        event.icon ||
        event.logo ||
        event.image ||
        event.img ||
        ""
    ).trim();
}

function getEventType(event) {
    const type = String(
        event.type ||
        event.format ||
        event.sourceType ||
        ""
    ).trim().toLowerCase();

    if (["m3u8", "hls", "application/vnd.apple.mpegurl"].includes(type)) {
        return "hls";
    }

    if (["mpd", "dash", "application/dash+xml"].includes(type)) {
        return "dash";
    }

    const url = getEventURL(event).toLowerCase();

    if (url.includes(".mpd")) {
        return "dash";
    }

    if (url.includes(".m3u8")) {
        return "hls";
    }

    return "";
}

function getEventURL(event) {
    return String(
        event.url ||
        event.m3u8 ||
        event.mpd ||
        event.src ||
        event.stream ||
        event.link ||
        ""
    ).trim();
}


/* =========================================================
   ABRIR EVENTO
========================================================= */

async function openEvent(event) {
    if (!event) {
        return;
    }

    if (currentUser && isUserExpired(currentUser)) {
        logout();
        setLoginError("Tu cuenta ha vencido.");
        return;
    }

    const url = getEventURL(event);
    const type = getEventType(event);

    if (!url) {
        showEventsScreen();
        alert("Este evento todavía no tiene una URL de transmisión.");
        return;
    }

    if (!/^https?:\/\//i.test(url)) {
        showEventsScreen();
        alert("La URL del evento no es válida.");
        return;
    }

    if (type !== "hls" && type !== "dash") {
        showEventsScreen();
        alert("Formato no reconocido. Usa M3U8/HLS o MPD/DASH.");
        return;
    }

    stopPlayer();

    const operationId = playerOperationId;

    currentEvent = event;
    playerIsLoading = true;
    playerHasStarted = false;

    if (playerTitle) {
        playerTitle.textContent = getEventName(event);
    }

    clearPlayerError();
    setPlayerLoading(true, "Accediendo al servidor...");

    showPlayerScreen();

    playerStartupTimer = setTimeout(function () {
        if (
            operationId === playerOperationId &&
            !playerHasStarted
        ) {
            showPlayerError(
                "La transmisión está tardando demasiado. " +
                "Comprueba tu conexión o intenta nuevamente."
            );
        }
    }, PLAYER_START_TIMEOUT);

    try {
        if (type === "hls") {
            await playHLS(url, event, operationId);
        } else {
            await playDASH(url, event, operationId);
        }

    } catch (error) {
        if (operationId !== playerOperationId) {
            return;
        }

        console.error("Error de reproducción:", error);

        showPlayerError(getPlayerErrorMessage(error));

    } finally {
        if (operationId === playerOperationId) {
            playerIsLoading = false;

            if (playerStartupTimer) {
                clearTimeout(playerStartupTimer);
                playerStartupTimer = null;
            }

            if (!playerHasStarted && !getVisiblePlayerError()) {
                setPlayerLoading(false);
            }
        }
    }
}


/* =========================================================
   HLS: HLS.JS Y ALTERNATIVA NATIVA
========================================================= */

async function playHLS(url, event, operationId) {
    if (window.Hls && Hls.isSupported()) {
        try {
            await playWithHlsJs(url, operationId);
            return;
        } catch (error) {
            if (operationId !== playerOperationId) {
                throw error;
            }

            console.warn(
                "HLS.js no inició la reproducción; se intentará otra opción.",
                error
            );
        }
    }

    if (operationId !== playerOperationId) {
        throw new Error("Reproducción cancelada.");
    }

    const nativeHlsSupported =
        videoPlayer.canPlayType("application/vnd.apple.mpegurl") ||
        videoPlayer.canPlayType("application/x-mpegURL");

    if (nativeHlsSupported) {
        try {
            await playWithNativeHLS(url, operationId);
            return;
        } catch (error) {
            if (operationId !== playerOperationId) {
                throw error;
            }

            console.warn("HLS nativo falló:", error);
        }
    }

    // Último intento: Shaka para HLS, si esta versión y el navegador
    // admiten el formato y las características del flujo.
    if (window.shaka && shaka.Player) {
        await playWithShaka(url, event, operationId, true);
        return;
    }

    throw new Error(
        "No se pudo iniciar el vídeo con HLS.js ni con HLS nativo."
    );
}

async function playWithHlsJs(url, operationId) {
    destroyHlsPlayer();

    clearPlayerError();
    setPlayerLoading(true, "Accediendo al servidor...");

    return new Promise(function (resolve, reject) {
        let settled = false;
        let networkRecoveries = 0;
        let mediaRecoveries = 0;
        let startupTimer = null;

        const hls = new Hls({
            enableWorker: true,

            lowLatencyMode: true,

            backBufferLength: 30,

            manifestLoadingTimeOut: 12000,
            manifestLoadingMaxRetry: 2,
            manifestLoadingRetryDelay: 1000,

            levelLoadingTimeOut: 12000,
            levelLoadingMaxRetry: 2,
            levelLoadingRetryDelay: 1000,

            fragLoadingTimeOut: 20000,
            fragLoadingMaxRetry: 3,
            fragLoadingRetryDelay: 1000,

            maxBufferLength: 20,
            maxMaxBufferLength: 40
        });

        hlsPlayer = hls;

        function cleanup() {
            if (startupTimer) {
                clearTimeout(startupTimer);
                startupTimer = null;
            }

            videoPlayer.removeEventListener("playing", onPlaying);
            videoPlayer.removeEventListener("error", onVideoError);
        }

        function finish(error) {
            if (settled) {
                return;
            }

            settled = true;
            cleanup();

            if (error) {
                if (hlsPlayer === hls) {
                    destroyHlsPlayer();
                }

                reject(error);
            } else {
                resolve();
            }
        }

        function onPlaying() {
            if (operationId !== playerOperationId) {
                finish(new Error("Reproducción cancelada."));
                return;
            }

            playerHasStarted = true;
            playerIsLoading = false;

            clearPlayerError();
            setPlayerLoading(false);

            finish();
        }

        function onVideoError() {
            if (videoPlayer.error) {
                finish(
                    new Error(getMediaErrorText(videoPlayer.error))
                );
            }
        }

        videoPlayer.addEventListener("playing", onPlaying);
        videoPlayer.addEventListener("error", onVideoError);

        startupTimer = setTimeout(function () {
            finish(
                new Error("HLS.js no inició la reproducción a tiempo.")
            );
        }, HLS_FALLBACK_TIMEOUT);

        hls.on(Hls.Events.MEDIA_ATTACHED, function () {
            if (operationId !== playerOperationId) {
                finish(new Error("Reproducción cancelada."));
                return;
            }

            hls.loadSource(url);
        });

        hls.on(Hls.Events.MANIFEST_PARSED, function () {
            if (operationId !== playerOperationId) {
                finish(new Error("Reproducción cancelada."));
                return;
            }

            const playPromise = videoPlayer.play();

            if (playPromise && typeof playPromise.catch === "function") {
                playPromise.catch(function (error) {
                    console.warn(
                        "El navegador no permitió iniciar automáticamente:",
                        error
                    );

                    // Los controles del vídeo quedan disponibles para
                    // que el usuario pueda iniciar la reproducción.
                });
            }
        });

        hls.on(Hls.Events.ERROR, function (_event, data) {
            if (operationId !== playerOperationId || settled) {
                return;
            }

            if (!data.fatal) {
                return;
            }

            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                if (networkRecoveries < MAX_NETWORK_RECOVERY) {
                    networkRecoveries++;

                    console.warn(
                        `Recuperación de red HLS ${networkRecoveries}/` +
                        `${MAX_NETWORK_RECOVERY}`
                    );

                    try {
                        hls.startLoad();
                    } catch (error) {
                        finish(error);
                    }

                    return;
                }

                finish(
                    new Error(
                        "Error de red: no se pudieron cargar " +
                        "la lista o los segmentos del vídeo."
                    )
                );

                return;
            }

            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                if (mediaRecoveries < MAX_MEDIA_RECOVERY) {
                    mediaRecoveries++;

                    console.warn(
                        `Recuperación de vídeo HLS ${mediaRecoveries}/` +
                        `${MAX_MEDIA_RECOVERY}`
                    );

                    try {
                        hls.recoverMediaError();
                    } catch (error) {
                        finish(error);
                    }

                    return;
                }

                finish(
                    new Error(
                        "El navegador no pudo recuperar la decodificación del vídeo."
                    )
                );

                return;
            }

            finish(
                new Error(
                    data.details
                        ? `Error HLS: ${data.details}`
                        : "El reproductor HLS encontró un error irrecuperable."
                )
            );
        });

        try {
            hls.attachMedia(videoPlayer);
        } catch (error) {
            finish(error);
        }
    });
}

async function playWithNativeHLS(url, operationId) {
    destroyHlsPlayer();

    videoPlayer.src = url;
    videoPlayer.load();

    const playPromise = videoPlayer.play();

    if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(function (error) {
            console.warn("Reproducción automática no disponible:", error);
        });
    }

    await waitForPlaying(PLAYER_START_TIMEOUT, operationId);
}

async function waitForPlaying(timeout, operationId) {
    if (operationId !== playerOperationId) {
        throw new Error("Reproducción cancelada.");
    }

    if (!videoPlayer.paused && videoPlayer.readyState >= 3) {
        playerHasStarted = true;
        playerIsLoading = false;
        clearPlayerError();
        setPlayerLoading(false);
        return;
    }

    return new Promise(function (resolve, reject) {
        let settled = false;
        let timer = null;

        function cleanup() {
            videoPlayer.removeEventListener("playing", onPlaying);
            videoPlayer.removeEventListener("error", onError);

            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        }

        function finish(error) {
            if (settled) {
                return;
            }

            settled = true;
            cleanup();

            if (error) {
                reject(error);
            } else {
                resolve();
            }
        }

        function onPlaying() {
            if (operationId !== playerOperationId) {
                finish(new Error("Reproducción cancelada."));
                return;
            }

            playerHasStarted = true;
            playerIsLoading = false;

            clearPlayerError();
            setPlayerLoading(false);

            finish();
        }

        function onError() {
            if (videoPlayer.error) {
                finish(
                    new Error(getMediaErrorText(videoPlayer.error))
                );
            }
        }

        videoPlayer.addEventListener("playing", onPlaying);
        videoPlayer.addEventListener("error", onError);

        timer = setTimeout(function () {
            finish(
                new Error("El vídeo no comenzó dentro del tiempo esperado.")
            );
        }, timeout);
    });
}


/* =========================================================
   MPD / DASH / DRM CON SHAKA PLAYER
========================================================= */

async function playDASH(url, event, operationId) {
    if (!window.shaka || !shaka.Player) {
        throw new Error(
            "Shaka Player no está disponible. Comprueba la biblioteca CDN."
        );
    }

    await playWithShaka(url, event, operationId, false);
}

async function playWithShaka(url, event, operationId, isHlsFallback) {
    if (!window.shaka || !shaka.Player) {
        throw new Error("Shaka Player no está disponible.");
    }

    destroyShakaPlayer();

    if (operationId !== playerOperationId) {
        throw new Error("Reproducción cancelada.");
    }

    clearPlayerError();

    setPlayerLoading(
        true,
        isHlsFallback
            ? "Intentando una reproducción alternativa..."
            : "Accediendo al servidor..."
    );

    const player = new shaka.Player();
    shakaPlayer = player;

    await player.attach(videoPlayer);

    if (operationId !== playerOperationId) {
        await destroyShakaPlayer();
        throw new Error("Reproducción cancelada.");
    }

    player.addEventListener("error", function (eventObject) {
        const detail = eventObject.detail;

        console.error("Error Shaka:", detail);

        if (
            operationId !== playerOperationId ||
            playerHasStarted
        ) {
            return;
        }

        const message = getShakaErrorMessage(detail);

        // El error visible lo gestiona también la promesa de carga.
        if (message) {
            console.warn(message);
        }
    });

    configureShakaDRM(player, event);

    await player.load(url);

    if (operationId !== playerOperationId) {
        throw new Error("Reproducción cancelada.");
    }

    const playPromise = videoPlayer.play();

    if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(function (error) {
            console.warn("Inicio automático bloqueado:", error);
        });
    }

    await waitForPlaying(PLAYER_START_TIMEOUT, operationId);
}

function configureShakaDRM(player, event) {
    const drm = event && event.drm;

    if (!drm || typeof drm !== "object") {
        return;
    }

    const servers = {};

    if (drm.servers && typeof drm.servers === "object") {
        Object.assign(servers, drm.servers);
    }

    if (drm.widevine) {
        servers["com.widevine.alpha"] = drm.widevine;
    }

    if (drm.playready) {
        servers["com.microsoft.playready"] = drm.playready;
    }

    if (drm.clearkey) {
        servers["org.w3.clearkey"] = drm.clearkey;
    }

    if (Object.keys(servers).length > 0) {
        player.configure({
            drm: {
                servers: servers
            }
        });
    }

    // Clear Key puede necesitar claves en formato compatible con Shaka.
    if (
        drm.clearKeys &&
        typeof drm.clearKeys === "object"
    ) {
        player.configure({
            drm: {
                clearKeys: drm.clearKeys
            }
        });
    }
}

function getShakaErrorMessage(error) {
    if (!error) {
        return "Error desconocido de Shaka Player.";
    }

    const code = Number(error.code);
    const category = Number(error.category);

    if (category === 1) {
        return "Error de red al cargar la transmisión o sus segmentos.";
    }

    if (category === 3) {
        return "El dispositivo no pudo reproducir o decodificar el vídeo.";
    }

    if (category === 4) {
        return "El manifiesto MPD/HLS no es válido o no se puede interpretar.";
    }

    if (category === 6) {
        return "Error DRM: revisa la licencia, las claves y la compatibilidad del dispositivo.";
    }

    if (code) {
        return `Shaka Player detectó un error (código ${code}).`;
    }

    return "No se pudo reproducir la transmisión con Shaka Player.";
}


/* =========================================================
   MENSAJES DE ERROR
========================================================= */

function getPlayerErrorMessage(error) {
    const message = String(error?.message || "").toLowerCase();

    if (
        message.includes("cancelada") ||
        message.includes("cancelado")
    ) {
        return "Reproducción cancelada.";
    }

    if (
        message.includes("network") ||
        message.includes("red") ||
        message.includes("segment")
    ) {
        return (
            "No se pudo conectar con el servidor de vídeo. " +
            "Comprueba tu conexión o que la transmisión esté disponible."
        );
    }

    if (
        message.includes("manifest") ||
        message.includes("m3u8") ||
        message.includes("mpd")
    ) {
        return (
            "No se pudo leer la lista de reproducción. " +
            "Comprueba la URL y el formato del evento."
        );
    }

    if (
        message.includes("drm") ||
        message.includes("license") ||
        message.includes("licencia")
    ) {
        return (
            "No se pudo autorizar la reproducción protegida. " +
            "Comprueba la licencia DRM y la compatibilidad del dispositivo."
        );
    }

    if (
        message.includes("decod") ||
        message.includes("media")
    ) {
        return (
            "El dispositivo no pudo reproducir el vídeo. " +
            "El formato, el códec o la transmisión pueden no ser compatibles."
        );
    }

    return (
        "No se pudo iniciar la transmisión. " +
        "Intenta nuevamente o comprueba la URL del evento."
    );
}

function getMediaErrorText(error) {
    switch (error.code) {
        case MediaError.MEDIA_ERR_ABORTED:
            return "La reproducción fue interrumpida.";

        case MediaError.MEDIA_ERR_NETWORK:
            return "Error de red al descargar el vídeo.";

        case MediaError.MEDIA_ERR_DECODE:
            return "Error al decodificar el vídeo.";

        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            return "El formato o la URL del vídeo no son compatibles.";

        default:
            return "Error de reproducción de vídeo.";
    }
}

function showPlayerError(message) {
    if (playerError) {
        playerError.textContent = message;
        playerError.classList.add("visible");
    }

    setPlayerLoading(false);
}

function clearPlayerError() {
    if (playerError) {
        playerError.textContent = "";
        playerError.classList.remove("visible");
    }
}

function getVisiblePlayerError() {
    return Boolean(
        playerError &&
        playerError.textContent.trim()
    );
}

function setPlayerLoading(visible, message) {
    if (!playerLoading) {
        return;
    }

    playerLoading.classList.toggle("hidden", !visible);

    if (message) {
        const span = playerLoading.querySelector("span");

        if (span) {
            span.textContent = message;
        }
    }
}


/* =========================================================
   DETENER Y LIBERAR EL REPRODUCTOR
========================================================= */

function stopPlayer() {
    // Invalida promesas y eventos que pertenezcan a una reproducción anterior.
    playerOperationId++;

    playerIsLoading = false;
    playerHasStarted = false;

    if (playerStartupTimer) {
        clearTimeout(playerStartupTimer);
        playerStartupTimer = null;
    }

    if (playerRetryTimer) {
        clearTimeout(playerRetryTimer);
        playerRetryTimer = null;
    }

    destroyHlsPlayer();

    // La destrucción de Shaka es asíncrona; se espera cuando sea posible.
    void destroyShakaPlayer();

    if (videoPlayer) {
        try {
            videoPlayer.pause();
            videoPlayer.removeAttribute("src");

            while (videoPlayer.firstChild) {
                videoPlayer.removeChild(videoPlayer.firstChild);
            }

            videoPlayer.load();

        } catch (error) {
            console.warn("Error al limpiar el vídeo:", error);
        }
    }

    currentEvent = null;

    setPlayerLoading(false);
    clearPlayerError();
}

function destroyHlsPlayer() {
    if (!hlsPlayer) {
        return;
    }

    try {
        hlsPlayer.destroy();
    } catch (error) {
        console.warn("Error destruyendo HLS.js:", error);
    }

    hlsPlayer = null;
}

async function destroyShakaPlayer() {
    if (!shakaPlayer) {
        return;
    }

    const oldPlayer = shakaPlayer;
    shakaPlayer = null;

    try {
        await oldPlayer.destroy();
    } catch (error) {
        console.warn("Error destruyendo Shaka Player:", error);
    }
}

function returnToEvents() {
    stopPlayer();
    showEventsScreen();
}


/* =========================================================
   INSTALACIÓN PWA
========================================================= */

function setupInstallButton() {
    window.addEventListener("beforeinstallprompt", function (event) {
        event.preventDefault();

        deferredInstallPrompt = event;

        installButton?.classList.remove("hidden");
    });

    installButton?.addEventListener("click", async function () {
        if (!deferredInstallPrompt) {
            alert(
                "Si la instalación no aparece, abre el menú del navegador " +
                "y selecciona «Instalar aplicación» o «Añadir a pantalla de inicio»."
            );
            return;
        }

        deferredInstallPrompt.prompt();

        try {
            await deferredInstallPrompt.userChoice;
        } catch (error) {
            console.warn("No se pudo completar la instalación:", error);
        }

        deferredInstallPrompt = null;
        installButton.classList.add("hidden");
    });

    window.addEventListener("appinstalled", function () {
        deferredInstallPrompt = null;
        installButton?.classList.add("hidden");
    });
}


/* =========================================================
   NAVEGACIÓN ANDROID TV / TECLADO
========================================================= */

function setupKeyboardNavigation() {
    document.addEventListener("keydown", function (event) {
        const target = event.target;

        // No interferir con la escritura en campos de texto.
        if (
            target &&
            (
                target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA" ||
                target.isContentEditable
            )
        ) {
            return;
        }

        if (event.key === "Escape" || event.key === "Backspace") {
            if (!playerScreen?.classList.contains("hidden")) {
                event.preventDefault();
                returnToEvents();
            }

            return;
        }

        if (playerScreen?.classList.contains("hidden")) {
            navigateEventCards(event);
        }
    });
}

function navigateEventCards(event) {
    const cards = Array.from(
        document.querySelectorAll(
            "#eventsGrid [data-event-index]"
        )
    );

    if (!cards.length) {
        return;
    }

    const activeIndex = cards.indexOf(document.activeElement);

    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();

        const nextIndex =
            activeIndex < 0 ? 0 : Math.min(activeIndex + 1, cards.length - 1);

        cards[nextIndex].focus();
    }

    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();

        const nextIndex =
            activeIndex < 0
                ? cards.length - 1
                : Math.max(activeIndex - 1, 0);

        cards[nextIndex].focus();
    }
}