# Theme, Route, and Performance Trace — 2026-08-27

## Confirmed theme ownership issue

The browser runtime and server catalog previously diverged. The browser runtime now separates `data-theme`/`data-themeMode` for light-dark mode from `data-themeTexture` for grid/scanline texture. The server catalog is now aligned with the expanded token contract and the grey-charcoal Classic dark preset.

## Confirmed route/boot findings

Vercel rewrites stream routes `/science`, `/commerce`, and `/humanities` to `public/html/streams`. Portal routes `/community`, `/issues`, `/volunteers`, `/accounts`, and `/about` resolve to `public/html/portal`. The lightweight `public/html/community.html` and `public/html/volunteers.html` remain dormant compatibility shells and are not the production route owners.

The current stream route derives `window.CURRENT_STREAM` once in the inline shell bootstrap, then `app.js` owns the workspace. The old SPA history interception was removed. No active `pushState` route swap remains in the root/stream route owner.

## Confirmed loading regression

Before the latest fix, a Science load produced 33 requests and fetched `/api/session` twice. The second request came from the theme and reading-preference boot paths not sharing `session-state.js`. The portal shell also loaded `config.js` and made an unnecessary `/api/config` request despite its active clients not consuming `appConfig`.

The fix loads `session-state.js` before `theme.js` in the stream and portal shells and removes `config.js` from the portal shell. The follow-up trace showed zero duplicate requests on Science, and Portal dropped from 20 to 19 requests with the `/api/config` request removed. Stream trees remain eager.

## Current local trace after fixes

| Route | DOM-content-loaded | Requests | Duplicate requests |
|---|---:|---:|---:|
| `/science` | 521 ms | 33 | 0 |
| `/community` | 421 ms | 19 | 0 |
| `/settings` | 535 ms | 18 | 0 |

The stream route remains the heaviest because its eager Markdown/editor/workspace stack is intentional. A later optimization must avoid lazy-loading stream trees but can consider bundling, dependency preloading, and renderer initialization boundaries.

## Remaining investigation

The next trace should inspect whether `mobile.js`, `auth.js`, `modern-auth.js`, and `app.js` attach overlapping document-level listeners on active shells, and whether ServiceWorker navigation caching causes a stale shell to be displayed before the network response. Route transitions should be tested with request logs and DOM boot markers, not only URL assertions.
