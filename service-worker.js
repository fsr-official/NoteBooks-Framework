// ===== WebMan Service Worker =====
// Strategy:
//   - Core app shell (index.html, offline.html, manifest, etc.) → Cache-first with background update
//   - files.json → Network-first (always fresh)
//   - GitHub API calls → Network-only (never cache)
//   - Everything else → Network-first, fall back to cache, fall back to offline page

const CACHE_VERSION = 'webman-v41';
const OFFLINE_PAGE = 'offline.html';

const APP_SHELL = [
  './',
  'index.html',
  'offline.html',
  'public/manifest.json',
  'public/favicon-128.png',
  'public/css/style.css',
  'public/css/tree.css',
  'public/css/dashboard.css',
  'public/js/config.js',
  'public/js/markdown-vendors.js',
  'public/js/app.js',
  'public/js/theme.js',
  'public/js/reading-preferences.js',
  'public/js/landing-docs.js',
  'public/js/stream-runtime.js',
  'public/js/raw-delivery.js',
  'public/js/dashboard.js',
  'public/js/admin-dashboard.js',
  'public/client/streams.js',
  'public/client/observability.js',
  'public/js/auth.js',
  'public/js/modern-auth.js',
  'public/js/upload.js',
  'public/js/mobile.js',
  'public/js/markdown.js',
  'public/js/md-init.js',
  'public/js/obsidian-markdown-it.js',
  'public/css/theme.css',
  'public/html/settings.html',
  'public/html/admin.html',
  'public/html/portal.html',
  'public/js/portal.js',
  'public/js/shell-nav.js',
  'public/js/sw-register.js',
  'public/js/request.js',
  'public/js/settings-nav.js',
  'public/js/session-state.js',
  'public/json/github-repos.json',
  'public/json/science-tree.json',
  'public/json/commerce-tree.json',
  'public/json/humanities-tree.json',
  'public/json/repo-registry.json',
  'public/bin/tikzjax/css/fonts.css',
  'public/bin/tikzjax/output/tikzjax.js',
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

const COOP_COEP_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

// In-memory stream trees loaded at install time. Format: { stream, root, repos: [...] }.
const STREAM_TREES = {};

async function loadStreamTrees() {
  const streams = ['science', 'commerce', 'humanities'];
  await Promise.all(streams.map(async (s) => {
    try {
      const runtimeUrl = `/api/system/${s}`;
      const jsonUrl = `/public/json/${s}-tree.json`;
      let res = await fetch(runtimeUrl, { cache: 'no-store' });
      if (!res.ok) res = await fetch(jsonUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(`no ${s}-tree`);
      STREAM_TREES[s] = await res.json();
    } catch (e) {
      STREAM_TREES[s] = null;
      // don't fail install on missing stream trees
      console.warn('[service-worker] could not load stream tree for', s, e?.message || e);
    }
  }));
}

function normalizePath(p) {
  return String(p || '').replace(/^\/+/, '').replace(/\\/g, '/');
}

function findFileInNode(node, targetPath) {
  if (!node) return null;
  if (node.type === 'file' && normalizePath(node.path) === normalizePath(targetPath)) return node;
  if (!Array.isArray(node.children)) return null;
  for (const c of node.children) {
    const found = findFileInNode(c, targetPath);
    if (found) return found;
  }
  return null;
}

function findFileForStream(stream, subpath) {
  const idx = STREAM_TREES[stream];
  if (!idx || !Array.isArray(idx.repos)) return null;
  const normalized = normalizePath(subpath);
  for (const repoEntry of idx.repos) {
    const repoRootName = String(repoEntry.tree?.name || '').replace(/^\/+/, '');
    // If subpath begins with repoRootName, strip it; else try matching directly
    let candidatePath = normalized;
    if (repoRootName && normalized.startsWith(repoRootName + '/')) {
      candidatePath = normalized.slice(repoRootName.length + 1);
    }
    // Try direct match and repo-root-prefixed match
    let file = findFileInNode(repoEntry.tree, candidatePath);
    if (!file) file = findFileInNode(repoEntry.tree, normalized);
    if (file) {
      // Ensure raw URL present
      if (file.raw) return { file, repoEntry };
    }
  }
  return null;
}

function withExtraHeaders(response, extra) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(extra)) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function cacheStaticResponse(request, response) {
  if (!response.ok || request.method !== 'GET') return;
  const clone = response.clone();
  caches.open(CACHE_VERSION)
    .then(cache => cache.put(request, clone))
    .catch(() => {
      // Cache failures must never reject the page's fetch event.
    });
}

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await Promise.allSettled(APP_SHELL.map(url => cache.add(url).catch(() => {})));
      // Do not fan out to all remote stream APIs during installation. Stream trees are
      // already precached as build artifacts and runtime stream/API requests remain lazy.
      // This keeps SW install fast and avoids making every client refresh all streams.
    })()
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

  if (url.hostname === 'api.github.com' || url.hostname.endsWith('.githubusercontent.com')) {
    event.respondWith(fetch(request));
    return;
  }

  if (url.pathname.startsWith('/api/system/')) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      event.respondWith(fetch(request));
      return;
    }
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (url.pathname.endsWith('files.json')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Admin routes must always follow the server/Vercel route decision. Do not
  // serve a cached legacy workspace shell for these security-sensitive pages.
  if (/^\/(?:admin|admin-prs)(?:\/|$)/.test(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const patched = withExtraHeaders(res, COOP_COEP_HEADERS);
          const clone = patched.clone();
          caches.open(CACHE_VERSION).then(c => c.put(request, clone));
          return patched;
        })
        .catch(() =>
          caches.match(request).then(cached => {
            if (cached) return withExtraHeaders(cached, COOP_COEP_HEADERS);
            return caches.match(OFFLINE_PAGE);
          })
        )
    );
    return;
  }

  // Stream-specific routing: map requests under /science/, /commerce/, /humanities/
  try {
    const pathname = url.pathname || '';
    const streamMatch = pathname.match(/^\/(science|commerce|humanities)\/(.*)$/);
    if (streamMatch && request.method === 'GET') {
      const stream = streamMatch[1];
      const subpath = streamMatch[2] || '';
      const resolved = findFileForStream(stream, subpath);
      if (resolved && resolved.file && resolved.file.raw) {
        event.respondWith(
          fetch(resolved.file.raw)
            .then((r) => {
              // Return response with COOP/COEP headers
              const patched = withExtraHeaders(r, COOP_COEP_HEADERS);
              // Cache the raw asset for offline fallback
              if (r.ok) {
                const clone = r.clone();
                caches.open(CACHE_VERSION).then(c => c.put(request, clone));
              }
              return patched;
            })
            .catch(() => caches.match(request).then(cached => cached || caches.match(OFFLINE_PAGE)))
        );
        return;
      }
    }
  } catch (e) {
    // ignore lookup errors and fallthrough to normal handling
    console.warn('[service-worker] stream routing error', e?.message || e);
  }

  if (APP_SHELL.includes(request.url) || APP_SHELL.includes(url.pathname.replace(/^\//, ''))) {
    const networkFetch = () => fetch(request).then(res => {
      cacheStaticResponse(request, res);
      return res;
    });
    event.respondWith(
      caches.match(request)
        .catch(() => null)
        .then(cached => cached || networkFetch())
        .catch(() => networkFetch())
    );
    return;
  }

  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok && request.method === 'GET') {
          const clone = res.clone();
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
