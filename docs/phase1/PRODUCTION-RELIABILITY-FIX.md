> **Document status:** historical implementation record. For current behavior, use [`docs/README.md`](../../README.md), the root [`README.md`](../../../README.md), and the active architecture/release documents.
>
# NoteBooks Production Reliability Fix

**Date:** 23 August 2026

## Executive finding

The production instability was caused by several independent ownership problems reinforcing one another. The browser treated standalone pages as in-place workspace transitions, the service worker fetched all three remote stream APIs during installation, the browser loaded configuration from three separate modules, and the stream/runtime paths preferred request-time API work over build-time artifacts. Vercel also had a stale `/admin` redirect and no explicit static routing for the generated JSON artifacts.

The result was slow route changes, repeated `/api/registry` and `/api/system/*` traffic, stale workspace state appearing on Dashboard, and repeated remote repository work even though the build had already generated the canonical stream files.

## Root causes verified from the supplied logs

| Symptom | Verified cause | Effect |
|---|---|---|
| Repeated `/api/registry` requests | Landing bootstrap called `fetchTree()` even when the landing page did not display a workspace. The API then entered its expensive fallback path when the generated artifact was not available inside the serverless bundle. | Remote manifest fetches and Commerce 404 warnings repeatedly slowed requests. |
| Three `/api/system/*` requests together | `service-worker.js` called `loadStreamTrees()` for Science, Commerce, and Humanities during installation. | Every worker installation fanned out to all streams, including the broken Commerce manifest. |
| Dashboard showed NCERT-Science/workspace state | `app.js` intercepted all same-origin navigation links and mutated the existing shared shell instead of allowing `/dashboard` to load `dashboard.html`. | The dedicated Dashboard document was never reached during SPA-style navigation. |
| Route changes felt messy or stale | Tree loading had no transition token, so an older asynchronous load could finish after a newer route transition and overwrite current state. | Previous stream content could appear after navigation. |
| Multiple `/api/config` calls per shared shell | `app.js`, `auth.js`, and `streams.js` each fetched configuration independently. | Every shared-shell document generated redundant config traffic. |
| `/admin` opened the wrong surface | `vercel.json` redirected `/admin` to `admin-prs.html`, overriding the extracted admin control-center route. | The new admin ownership boundary was bypassed in production. |

The repeated Commerce warning is a separate repository issue: `fsr-commerce/NCERT-Commerce` returns `404` for its root `files.json`. The build and runtime preserve a stale Commerce artifact rather than failing the entire application.

## Applied fixes

The browser router now intercepts only routes that intentionally share the workspace shell: Home, Science, Commerce, and Humanities. Settings, the personal-space Dashboard compatibility path, Admin, PR review, Community, Issues, Volunteers, Accounts, and About use server-owned document shells; the latter portal pages use a lightweight controller rather than the workspace/editor runtime. This restores the server-owned shell boundary and prevents Dashboard state from inheriting the current workspace.

Tree loads now carry a transition serial and the route observed at load start. A response is discarded if the user has moved to another route before the asynchronous load finishes. Update polling also has a singleton guard, preventing multiple intervals from being created during repeated initialization.

The service worker no longer loads all stream trees during installation. Generated static artifacts are already in the build shell and stream API requests remain lazy. The worker cache version is `webman-v14`, and the shared configuration bootstrap plus lightweight portal assets are included in the cached shell.

The stream runtime and stream client now prefer `/public/json/<stream>-tree.json` and use `/api/system/<stream>` only as a compatibility fallback. Cache-busting timestamps were removed from static artifact requests. The landing page no longer calls the combined registry loader unless an actual stream workspace needs it.

`public/js/config.js` now owns one browser-wide `/api/config` promise. The app, authentication bootstrap, and stream repository-map logic reuse that promise, reducing shared-shell config requests to one per document.

Vercel routing now maps `/api/registry` and `/api/system/:stream` directly to generated static JSON artifacts, maps the standalone shells to their canonical HTML files, removes the stale `/admin` redirect, and includes the canonical repository metadata and generated artifacts in the catch-all function bundle for compatibility fallbacks. Production startup no longer regenerates remote artifacts; the build owns generation and production fails fast only if required artifacts are missing.

## Verification

The final local production-shaped build passed. The complete regression suite passed with **27 test files and 73 tests**. The production-shaped server started without startup artifact generation and served the following route classes successfully: landing, stream shells, portal shells, Dashboard, Settings, Admin, registry artifact, and all three stream artifacts.

The browser probe verified that Home, Science, Issues, and Settings had the expected document ownership. Settings owns the personal Dashboard section, while `/dashboard` is a compatibility redirect; the personal section has no workspace DOM. Portal routes use their own lightweight shell. The probe recorded **zero `/api/registry` and zero `/api/system/*` requests** during the route sequence because the client used static build artifacts. `/api/config` remains one request per shared-shell document; `/dashboard` itself is only a redirect and the Settings personal-space section is rendered within the Settings shell.

The production-shaped local server reported no startup generation or rerun message. The remaining slower responses are the large static JSON payload sizes for Science and Humanities when accessed directly; these are local static reads and no longer trigger remote repository reconstruction. The Commerce artifact is intentionally small/stale until its upstream root `files.json` is restored or the registry entry is corrected.

## Deployment note

The next Vercel deployment must include the updated `vercel.json`, `service-worker.js`, shared `config.js`, compiled client output, and generated `public/json` artifacts. Vercel’s rewrite configuration routes requests without changing the browser URL, which is required for the clean application paths to retain their ownership while serving the canonical static shells and JSON files.[1] The catch-all function’s included files are a compatibility fallback; the static rewrites are the primary performance path.

After deployment, verify that `/api/registry` and `/api/system/science` are served as static artifact responses rather than serverless fallback executions, and that the first visit to `/dashboard` returns `NoteBooks Dashboard` rather than the workspace shell. If `/api/registry` still appears as a function request, inspect the active Vercel project’s routing configuration and confirm this branch’s `vercel.json` is the deployment root.

## References

[1]: https://vercel.com/docs/routing/rewrites "Vercel Documentation: Rewrites"
