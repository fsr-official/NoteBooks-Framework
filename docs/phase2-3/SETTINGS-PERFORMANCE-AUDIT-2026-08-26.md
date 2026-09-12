# Settings Performance Audit

**Route:** `/settings#personal-space`
**Audit date:** 2026-08-26
**Constraint:** Keep stream artifacts eager; do not introduce lazy tree loading.

## Findings

The deployed Settings response was not the same shell as the current `whoami` source. The live response was approximately 40.7 KB and referenced 23 scripts, including the 103 KB shared `app.js`, stream/runtime clients, multiple Markdown clients, four external Markdown CDN scripts, and several legacy shell modules. The current repository Settings shell is approximately 8.1 KB and needs only route-specific clients.

The shared `app.js` boot path also performs global explorer initialization and waits for `/api/config` even though it correctly skips stream-tree loading on `/settings`. This means the page paid for the heavyweight explorer bundle and unrelated boot work without needing any content tree.

The original Settings-specific clients made separate initial reads for the theme catalog, session, reader preferences, and dashboard. Theme initialization also waited for the theme catalog before reading session state, serializing two requests.

## Remediation

The Settings shell now loads only:

```text
observability.js
shell-nav.js
session-state.js
theme.js
reading-preferences.js
dashboard.js
```

It no longer loads `app.js` or `stream-runtime.js`; this does not change the eager loading contract for Science, Commerce, or Humanities shells.

`session-state.js` deduplicates the initial `/api/session` read and aborts it after 1.5 seconds, falling back to browser-local state. Theme catalog and dashboard requests are bounded at 1.8 seconds. Theme initialization applies local state immediately and fetches the catalog and shared session concurrently. The dashboard renders an offline project outline when its request fails or times out.

The service-worker cache was bumped to `webman-v33` and now precaches `public/js/session-state.js`.

## Validation

The optimized local production build served `/settings` in approximately 4 ms with an 8.1 KB HTML shell. All Settings assets returned successfully. The local API checks returned HTTP 200 for `/api/health`, `/api/config`, `/api/session`, `/api/themes`, and `/api/dashboard`; guest `/api/theme` returned the expected 204 response. JavaScript syntax checks, TypeScript checks, the full test suite, production build, and production dependency audit passed.

The live site’s prior console output showed API requests completing with zero transferred bytes and `FUNCTION_INVOCATION_FAILED`; that was a serverless deployment issue, not a browser rendering delay. After deploying the current branch, repeat the browser timing check and verify that the live Settings HTML no longer includes `app.js`, `stream-runtime.js`, or the legacy Markdown/editor scripts.

## Release verification

A healthy production Settings deployment should satisfy all of the following:

1. `/version.json` identifies the newly deployed commit.
2. `/settings` contains the lightweight script set and does not reference `public/js/app.js`.
3. `/api/session`, `/api/themes`, and `/api/dashboard` return successfully or fail within their bounded client fallback windows.
4. The personal-space section becomes usable from browser-local state without waiting for the dashboard API.
5. Science, Commerce, and Humanities still use their existing eager stream shell and tree artifact paths.
