// ===== WebMan Service Worker =====
// Strategy:
//   - Core app shell (index.html, offline.html, manifest, etc.) → Cache-first with background update
//   - files.json → Network-first (always fresh)
//   - GitHub API calls → Network-only (never cache)
//   - Everything else → Network-first, fall back to cache, fall back to offline page

const CACHE_VERSION = 'webman-v7';
const OFFLINE_PAGE = 'offline.html';

const APP_SHELL = [
  './',
  'index.html',
  'offline.html',
  'manifest.json',
  'favicon.png',
  'public/style.css',
  'public/app.js',
  'public/client/subjects.js',
  'public/auth.js',
  'public/upload.js',
  'public/mobile.js',
  'public/markdown.js',
  'public/md-init.js',
  'public/obsidian-markdown-it.js',
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

const COOP_COEP_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

// In-memory subject trees loaded at install time. Format: { subject: { repos: [...] } }
const SUBJECT_TREES = {};

async function loadSubjectTrees() {
  const subjects = ['science', 'commerce', 'humanities'];
  await Promise.all(subjects.map(async (s) => {
    try {
      const res = await fetch(`/public/${s}-tree.json`);
      if (!res.ok) throw new Error(`no ${s}-tree`);
      SUBJECT_TREES[s] = await res.json();
    } catch (e) {
      SUBJECT_TREES[s] = null;
      // don't fail install on missing subject trees
      console.warn('[service-worker] could not load subject tree for', s, e?.message || e);
    }
  }));
}

function normalizePath(p) {
  return String(p || '').replace(/^\/+/, '').replace(/\/g, '/');
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

function findFileForSubject(subject, subpath) {
  const idx = SUBJECT_TREES[subject];
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

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await Promise.allSettled(APP_SHELL.map(url => cache.add(url).catch(() => {})));
      // Load subject trees into memory so fetch handler can resolve subject files
      try { await loadSubjectTrees(); } catch (e) { /* ignore */ }
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

  // Subject-specific routing: map requests under /science/, /commerce/, /humanities/
  try {
    const pathname = url.pathname || '';
    const subjectMatch = pathname.match(/^\/(science|commerce|humanities)\/(.*)$/);
    if (subjectMatch && request.method === 'GET') {
      const subject = subjectMatch[1];
      const subpath = subjectMatch[2] || '';
      const resolved = findFileForSubject(subject, subpath);
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
    console.warn('[service-worker] subject routing error', e?.message || e);
  }

  if (APP_SHELL.includes(request.url) || APP_SHELL.includes(url.pathname.replace(/^\//, ''))) {
    event.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request).then(res => {
          const clone = res.clone();
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
