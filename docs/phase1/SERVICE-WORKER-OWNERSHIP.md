# Service Worker Ownership

## Canonical source

`service-worker.js` is the sole deployed service-worker source. It is served directly at `/service-worker.js` by the Node/Express server and is the file that Vercel/static hosting must expose. The former `src/service-worker.ts` variant was unreferenced by the build, route, test, and deployment graphs and has been removed to prevent silent divergence.

## Current contract

| Concern | Owner/contract |
|---|---|
| Cache version | `webman-v10`; increment when the shell or routing contract changes. |
| App shell assets | Includes the landing shell, Settings shell, theme runtime, local landing-document runtime, stream runtime, raw-delivery runtime, generated stream artifacts, Markdown/TikZ assets, and required external renderer assets. |
| Stream trees | Installation attempts runtime `/api/system/:stream` first and falls back to `/public/json/<stream>-tree.json`. |
| Raw file delivery | `/api/raw` remains the normal application path; stream-specific offline routing uses the raw URL embedded in generated file nodes. |
| Local files | `files.json` is network-first and falls back to cache, preserving local landing-document discovery offline. |
| Navigation | Navigation responses receive COOP/COEP headers and fall back to cached pages or `offline.html`. |
| Admin routes | Admin/admin-PR navigation is network-only and never served from a cached legacy shell. |

## Upgrade rules

Only `service-worker.js` may be edited for deployed behavior. Any future change to app-shell assets, routes, stream artifact names, raw delivery, or Settings must update this file and increment `CACHE_VERSION`.

If TypeScript becomes necessary for service-worker maintenance, it must compile to `service-worker.js` through an explicit build step. A second handwritten implementation is prohibited.

The service-worker regression test must verify the cache version, canonical extracted browser modules, Settings, generated stream artifacts, admin network-only behavior, and the raw/stream routing contract.
