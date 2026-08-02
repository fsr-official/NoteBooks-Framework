// ===== WebMan Service Worker =====
// Strategy:
//   - Core app shell (index.html, offline.html, manifest, etc.) → Cache-first with background update
//   - files.json → Network-first (always fresh)
//   - GitHub API calls → Network-only (never cache)
//   - Everything else → Network-first, fall back to cache, fall back to offline page

const CACHE_VERSION = 'webman-v5';
const OFFLINE_PAGE  = 'offline.html';

const APP_SHELL = [
  './',
  'index.html',
  'offline.html',
  'manifest.json',
  'favicon.png',
  'bin/style.css',
  'bin/app.js',
  'bin/auth.js',
  'bin/upload.js',
  'bin/mobile.js',
  'bin/markdown.js',
  'bin/md-init.js',
  'bin/obsidian-markdown-it.js',
  // tikzjax.js is 7 MB — cached on first use by the network-first handler, not pre-cached here
  'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
  'https://cdn.jsdelivr.net/npm/markdown-it@14/dist/markdown-it.min.js',
  'https://cdn.jsdelivr.net/npm/markdown-it-sub@1/dist/markdown-it-sub.min.js',
  'https://cdn.jsdelivr.net/npm/markdown-it-sup@1/dist/markdown-it-sup.min.js',
  'https://cdn.jsdelivr.net/npm/markdown-it-footnote@3/dist/markdown-it-footnote.min.js',
  'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js',
  'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/highlight.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github-dark.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
];

// Headers required for SharedArrayBuffer (used by tikzjax's WASM TeX engine).
// Without COOP + COEP the browser withholds SharedArrayBuffer and the TeX
// worker fails silently, producing no DVI output ("Could not find file input.dvi").
const COOP_COEP_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

/** Rebuild a Response with extra headers merged in. */
function withExtraHeaders(response, extra) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(response.body, {
    status:     response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      Promise.allSettled(APP_SHELL.map(url => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. GitHub API → network only
  if (url.hostname === 'api.github.com' || url.hostname.endsWith('.githubusercontent.com')) {
    event.respondWith(fetch(request));
    return;
  }

  // 2. files.json → network first (must always be fresh)
  if (url.pathname.endsWith('files.json')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone(); // clone synchronously before body is consumed
          caches.open(CACHE_VERSION).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 3. Top-level navigation → network first, inject COOP/COEP, fallback offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const patched = withExtraHeaders(res, COOP_COEP_HEADERS);
          const clone   = patched.clone(); // clone synchronously before body is consumed
          caches.open(CACHE_VERSION).then(c => c.put(request, clone));
          return patched;
        })
        .catch(() =>
          caches.match(request).then(cached => {
            // Inject headers even from cache so tikzjax works offline.
            if (cached) return withExtraHeaders(cached, COOP_COEP_HEADERS);
            return caches.match(OFFLINE_PAGE);
          })
        )
    );
    return;
  }

  // 4. App shell assets → cache first + background update
  if (APP_SHELL.includes(request.url) || APP_SHELL.includes(url.pathname.replace(/^\//, ''))) {
    event.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request).then(res => {
          const clone = res.clone(); // clone synchronously before body is consumed
          caches.open(CACHE_VERSION).then(c => c.put(request, clone));
          return res;
        });
        return cached || networkFetch;
      })
    );
    return;
  }

  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // 5. Everything else → network first, then cache, then offline
  event.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok && request.method === 'GET') {
          const clone = res.clone(); // clone synchronously before body is consumed
          caches.open(CACHE_VERSION).then(c => c.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match(OFFLINE_PAGE)))
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHE') {
    caches.delete(CACHE_VERSION).then(() => event.source?.postMessage({ type: 'CACHE_CLEARED' }));
  }
});