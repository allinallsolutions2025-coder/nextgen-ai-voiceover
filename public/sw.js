const CACHE_PREFIX = "nextgen-ai-voiceover";
const CACHE_VERSION = "v1";
const APP_CACHE = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${CACHE_VERSION}`;

function isModelHost(hostname) {
  return hostname === "huggingface.co" ||
    hostname.endsWith(".huggingface.co") ||
    hostname === "hf.co" ||
    hostname.endsWith(".hf.co") ||
    hostname === "cdn.jsdelivr.net" ||
    hostname.endsWith(".xethub.hf.co");
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    const scope = self.registration.scope;
    await cache.addAll([
      scope,
      new URL("index.html", scope).href,
      new URL("manifest.webmanifest", scope).href,
      new URL("icon.svg", scope).href,
      new URL("icon-192.png", scope).href,
      new URL("icon-512.png", scope).href
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(CACHE_PREFIX) && name !== APP_CACHE && name !== RUNTIME_CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range")) return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const cacheableExternal = !sameOrigin && isModelHost(url.hostname);
  if (!sameOrigin && !cacheableExternal) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) ||
          (await cache.match(new URL("index.html", self.registration.scope).href));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(sameOrigin ? APP_CACHE : RUNTIME_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok && response.type !== "opaque") {
      try { await cache.put(request, response.clone()); } catch { /* Storage may be full. */ }
    }
    return response;
  })());
});
