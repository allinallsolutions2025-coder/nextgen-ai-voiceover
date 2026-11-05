const CACHE_PREFIX = "nextgen-ai-voiceover-shell-";
const CACHE_NAME = CACHE_PREFIX + "v1";
const APP_FILES = [
  "./",
  "./index.html",
  "./src/main.js",
  "./src/pwa.js",
  "./src/styles.css",
  "./src/lib/text.js",
  "./src/lib/voice-catalog.js",
  "./src/lib/pronunciation.js",
  "./src/lib/narration.js",
  "./src/lib/paragraph-editor.js",
  "./src/lib/subtitles.js",
  "./src/lib/audio-processing.js",
  "./src/lib/audio-metadata.js",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_FILES.map((file) => new URL(file, self.registration.scope).href));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(new URL("./index.html", scope).href, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) ||
          (await caches.match(new URL("./index.html", scope).href));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
