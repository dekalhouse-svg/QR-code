const CACHE_NAME = "qr-code-v3";
const APP_SHELL = [
    "/",
    "/manifest.json",
    "/static/css/style.css",
    "/static/js/app.js",
    "/static/icons/icon-192.png",
    "/static/icons/icon-512.png"
];
const JSQR_CDN = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";

self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);

        // Une ressource indisponible ne doit pas empêcher toute l'application de s'installer.
        await Promise.all(APP_SHELL.map(async path => {
            try {
                const response = await fetch(path, { cache: "no-cache" });
                if (response.ok) await cache.put(path, response);
            } catch (_) {}
        }));

        // Précharge aussi la bibliothèque du scanner lorsqu'Internet est disponible.
        try {
            const response = await fetch(JSQR_CDN);
            if (response.ok) await cache.put(JSQR_CDN, response);
        } catch (_) {}
    })());
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key.startsWith("qr-code-") && key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") return;

    const url = new URL(event.request.url);

    // Les médias publicitaires sont servis par le même domaine.
    // En ligne, on actualise le cache ; hors ligne, on réutilise la dernière copie.
    if (url.origin === self.location.origin && url.pathname.startsWith("/api/ad-media/")) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            try {
                const response = await fetch(event.request);
                if (response && response.ok) {
                    await cache.put(event.request, response.clone());
                    return response;
                }
                const cached = await cache.match(event.request);
                if (cached) return cached;
                return response;
            } catch (_) {
                const cached = await cache.match(event.request);
                if (cached) return cached;
                return new Response("Média publicitaire indisponible hors connexion.", {
                    status: 503,
                    headers: { "Content-Type": "text/plain; charset=utf-8" }
                });
            }
        })());
        return;
    }

    // La liste des publicités doit toujours essayer le réseau.
    // L'application utilise ensuite sa copie locale si la requête échoue.
    if (url.origin === self.location.origin && url.pathname === "/api/ads") {
        return;
    }

    // Permet de réutiliser la bibliothèque du scanner qui a été préchargée.
    if (url.href === JSQR_CDN) {
        event.respondWith((async () => {
            const cached = await caches.match(event.request);
            if (cached) return cached;
            return fetch(event.request);
        })());
        return;
    }

    // Cache-first pour les ressources de l'application déjà installées.
    event.respondWith((async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;

        const response = await fetch(event.request);
        if (
            response &&
            response.ok &&
            url.origin === self.location.origin
        ) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, response.clone());
        }
        return response;
    })());
});
