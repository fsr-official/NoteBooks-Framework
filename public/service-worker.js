const CACHE_NAME = "notebooks-v2-v4";
const OWNED_CACHE_PREFIX = "notebooks-v2-";
const LEGACY_CACHE_PREFIX = "webman-v";
const MAX_CACHED_PAGES = 20;
const APP_SHELL = ["/manifest.json", "/favicon.png", "/favicon-128.png"];
const PRIVATE_PATHS = ["/account", "/login", "/register", "/auth", "/oauth", "/admin"];

function isPrivatePath(pathname) {
  return PRIVATE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isCacheable(response) {
  const cacheControl = response.headers.get("cache-control") ?? "";
  return response.status === 200
    && !response.headers.has("set-cookie")
    && !/\b(?:private|no-store)\b/i.test(cacheControl);
}

async function pruneCache(cache) {
  const requests = await cache.keys();
  const staleBuildAssets = requests.filter((request) => new URL(request.url).pathname.startsWith("/_next/"));
  await Promise.all(staleBuildAssets.map((request) => cache.delete(request)));

  const pages = (await cache.keys()).filter((request) =>
    !APP_SHELL.includes(new URL(request.url).pathname),
  );
  const overflow = pages.length - MAX_CACHED_PAGES;
  if (overflow > 0) {
    await Promise.all(pages.slice(0, overflow).map((request) => cache.delete(request)));
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        const results = await Promise.allSettled(APP_SHELL.map((path) => cache.add(path)));
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            console.warn(`NoteBooks offline asset could not be cached: ${APP_SHELL[index]}`, result.reason);
          }
        });
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names
        .filter((name) => (name.startsWith(OWNED_CACHE_PREFIX) && name !== CACHE_NAME)
          || name.startsWith(LEGACY_CACHE_PREFIX))
        .map((name) => caches.delete(name))))
      .then(async () => {
        await pruneCache(await caches.open(CACHE_NAME));
        await self.clients.claim();
      }),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.headers.has("range")) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (
    url.pathname.startsWith("/api/")
    || url.pathname.startsWith("/_next/")
  ) return;

  if (request.mode === "navigate") {
    if (isPrivatePath(url.pathname)) return;
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      let response;
      try {
        response = await fetch(new Request(request, { cache: "no-cache" }));
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        const home = await cache.match("/");
        if (home) return home;
        return new Response(
          "<!doctype html><meta name=\"viewport\" content=\"width=device-width\"><title>Offline</title><main><h1>You’re offline</h1><p>Reconnect to continue using NoteBooks.</p></main>",
          { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }
      if (isCacheable(response)) {
        try {
          await cache.put(request, response.clone());
          await pruneCache(cache);
        } catch (error) {
          console.warn("NoteBooks navigation cache update failed", error);
        }
      }
      return response;
    })());
    return;
  }

  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      let response;
      try {
        response = await fetch(new Request(request, { cache: "no-cache" }));
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw new Error(`Offline app-shell asset unavailable: ${url.pathname}`);
      }
      if (isCacheable(response)) {
        try {
          await cache.put(request, response.clone());
        } catch (error) {
          console.warn(`NoteBooks app-shell cache update failed: ${url.pathname}`, error);
        }
      }
      return response;
    })());
  }
});
