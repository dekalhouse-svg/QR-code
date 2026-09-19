const CACHE = "codeqr-v1";

const fichiers = [
    "./",
    "./index.html",
    "./manifest.json",
    "./icon.png"
];

self.addEventListener("install", function(event) {
    event.waitUntil(
        caches.open(CACHE).then(function(cache) {
            return cache.addAll(fichiers);
        })
    );
});

self.addEventListener("fetch", function(event) {
    event.respondWith(
        caches.match(event.request).then(function(response) {
            return response || fetch(event.request);
        })
    );
});