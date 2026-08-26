# NoteBooks Framework Website-Wide Audit

**Date:** 2026-08-26
**Scope:** Navigation, route movement, shell ownership, duplicate boot behavior, first-load performance, stability, accessibility-oriented interaction behavior, and public security boundaries.

## Executive conclusion

The application had several confirmed sources of instability: inconsistent navigation markup across standalone HTML shells, multiple clients capable of owning navigation state, legacy SPA history interception inside the explorer runtime, parser-blocking bottom-of-document scripts, and a local raw-file fallback that could address hidden or private-looking project files. The navigation and shell issues were corrected in the preceding stabilization commit, and this audit added performance and security hardening without changing the eager stream-tree loading requirement.

The current architecture keeps **full-document navigation authoritative**. The root, stream, portal, Settings, and admin shells remain separate, and only the shell-specific clients boot on each page. Science, Commerce, and Humanities still use eager stream artifacts; no lazy tree conversion was introduced.

## Findings and fixes

| Area | Finding | Disposition |
|---|---|---|
| Navigation consistency | Public shells had different link sets; Portal and Admin still exposed `My space`/Dashboard. | Fixed previously and covered by frontend tests. |
| Route movement | `app.js` intercepted links and `popstate`, reused the current DOM, and could combine old workspace state with a new route. | Fixed previously; full-document navigation is now authoritative. |
| Duplicate boot | Root and stream shells loaded unused `public/client/main.js` and `public/client/streams.js`; navigation handlers lacked idempotence guards. | Fixed previously; unused tags were removed and guards were added. Files remain dormant. |
| Settings usability | Personal space was visually embedded without a clear section model. | Fixed previously; Settings now has a left rail with Personal space, Appearance, Reading controls, and Account. |
| Parser blocking | Root, stream, and portal bottom-of-document clients were loaded as parser-blocking classic scripts. | Fixed in this audit by adding `defer` while preserving dependency order. |
| CSP telemetry | `connect-src` did not explicitly allow the Vercel insight beacon host. | Fixed by allowing `https://va.vercel-scripts.com`. |
| Browser capabilities | No explicit Permissions-Policy was emitted. | Fixed with camera, microphone, geolocation, payment, and USB disabled by default. |
| Local file boundary | Raw fallback and `/files/*` path handling prevented traversal by resolution checks but did not reject hidden files, `.env*`, or private-key extensions early. | Fixed with a shared published-file path guard. |

## Measurements

Measurements were taken against the locally built production server on 2026-08-26. They are not a substitute for a fresh Vercel measurement.

| Local request | Typical total response time | Notes |
|---|---:|---|
| `/` | 1.6–7.8 ms | Heavy explorer shell remains intentional for the home/workspace experience. |
| `/settings` | 1.7–2.3 ms | Lightweight Settings shell; no `app.js`. |
| `/science` | 1.6–2.7 ms | Eager stream shell/runtime retained. |
| `/community` | 1.5–3.0 ms | Portal shell without explorer runtime. |
| `/api/session` | 1.1–2.1 ms | Session response path. |
| `/api/themes` | 1.4–2.1 ms | Theme catalog path. |
| `/api/dashboard` | 1.1–1.5 ms | Dashboard data path. |
| `/api/config` | 1.6–3.0 ms | Shared configuration endpoint. |
| `/api/registry` | 22–31 ms | Large registry response; eager repository data remains intentional. |

The local shell sizes were approximately **40.6 KB for the root explorer shell**, **9.7 KB for Settings including the new rail**, **6.7 KB for the stream shell**, and **1.9 KB for the portal shell**. The Settings page does not load `app.js`, `stream-runtime.js`, or Markdown vendor clients.

## Security header result

The server already emitted Helmet protections including CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, HSTS, and cross-origin isolation headers. This audit retained those protections and added an explicit Permissions-Policy plus the missing Vercel insight connection allowance.

The CSP still permits `'unsafe-inline'` because the legacy explorer shell contains inline handlers and inline configuration. Removing that allowance would require a separate controlled migration of those handlers to external listeners; it was not silently changed because it could break the mature explorer surface.

Raw delivery remains intentionally cross-origin for public repository assets. The raw endpoint continues to validate repository overrides against the registry rather than acting as an unrestricted GitHub proxy.

## Validation performed

The following checks passed after the fixes:

- JavaScript syntax checks for the navigation and Settings clients.
- TypeScript typecheck.
- Full Vitest suite: **111 passed**, 2 database integration tests skipped because they are environment-gated.
- Production build.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Local route and static-asset smoke tests.
- Security-boundary tests for hidden/private paths and response headers.
- GitHub CI, Integration Tests, and generated-manifest workflow after push.

## Residual production checks

The local server cannot prove that the Vercel project has deployed the latest branch. After deployment, verify the production route matrix with cache-busting requests and confirm that `/settings` contains the lightweight shell markers and does not contain `/public/js/app.js`, `/public/js/stream-runtime.js`, or `/public/js/markdown-vendors.js`.

Production Supabase RLS posture remains a separate release concern documented elsewhere. This audit did not blanket-enable RLS because the existing table/policy design requires table-by-table review.
