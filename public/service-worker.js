const CACHE_NAME = "notebooks-v2-v1";
const LEGACY_CACHE_NAMES = new Set(["webman-v52"]);
const APP_SHELL = ["/manifest.json", "/favicon.png", "/favicon-128.png"];
const PRIVATE_PATHS = ["/account", "/login", "/register", "/oauth", "/admin"];

function isPrivatePath(pathname) {
  return PRIVATE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isCacheable(response) {
  const cacheControl = response.headers.get("cache-control") ?? "";
  return response.status === 200
    && !response.headers.has("set-cookie")
    && !/\b(?:private|no-store)\b/i.test(cacheControl);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(APP_SHELL.map((path) => cache.add(path))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names
        .filter((name) => (name.startsWith("notebooks-v2-") && name !== CACHE_NAME) || LEGACY_CACHE_NAMES.has(name))
        .map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.headers.has("range")) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (
    url.pathname.startsWith("/api/")
    || (url.pathname.startsWith("/_next/") && !url.pathname.startsWith("/_next/static/"))
  ) return;

  if (request.mode === "navigate") {
    if (isPrivatePath(url.pathname)) return;
    event.respondWith(
      fetch(request).then(async (response) => {
        if (isCacheable(response)) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      }).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        const home = await cache.match("/");
        if (home) return home;
        return new Response(
          "<!doctype html><meta name=\"viewport\" content=\"width=device-width\"><title>Offline</title><main><h1>You’re offline</h1><p>Reconnect to continue using NoteBooks.</p></main>",
          { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }),
    );
    return;
  }

  if (APP_SHELL.includes(url.pathname) || url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (isCacheable(response)) await cache.put(request, response.clone());
        return response;
      }),
    );
  }
});
