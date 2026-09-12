# Classic Dark Theme Trace and UI Bug Audit

**Date:** 2026-08-28  
**Scope:** Classic dark mode, theme persistence, active shells, ServiceWorker delivery, and adjacent UI regressions  
**Branch:** `whoami`

## Executive finding

Classic dark was not failing because its primary palette was absent. The browser and server catalogs already contained a grey-charcoal palette. The failure came from state and cascade inconsistencies: the Settings shell advertised Classic as “Classic light”; a server session persisted as dark could fail to override a locally saved light mode; `/api/theme` preferred a stale theme cookie over the selected session preset; and the stream shell’s higher-specificity navigation and background rules bypassed the global token bridge.

The corrected Classic dark contract is now:

| Token | Value |
|---|---|
| Page background (`--bg`) | `#1b1f24` |
| Main surface (`--surface`) | `#262b32` |
| Panel / strong surface (`--panel`, `--surface-strong`) | `#2b3138` / `#30363d` |
| Muted surface | `#20252b` |
| Input surface | `#1d2228` |
| Text | `#e6edf3` |
| Muted text | `#aab4c0` |
| Code surface | `#161b22` |
| Borders | `#4b5563` |
| Texture | `none` |

## Trace results

### Browser state

The theme runtime writes separate attributes for mode and texture. The mode attributes are restricted to `dark` or `light`, while the texture attribute is independent:

```text
data-theme="dark" or "light"
data-theme-mode="dark" or "light"
data-theme-texture="grid", "scanlines", or "none"
```

The bootstrap logic now treats a valid server theme state as authoritative for that state. In particular, a server-persisted `themeMode: "dark"` can no longer leave a locally remembered light mode active. Custom theme restoration also records the `custom` family explicitly.

### Server state

The `/api/theme` response previously examined the anonymous theme cookie before the browser session. This allowed an old custom or light cookie to mask a newly selected global preset. The response now resolves the selected session preset or custom theme first and only falls back to the cookie when the session does not contain a theme.

Custom theme writes now persist the submitted `mode` into the browser session instead of saving only the token values. This prevents custom light themes from reverting to dark on the next page load.

### CSS cascade

The active stream shell had rules such as `.stream-shell-page .global-nav` and `.stream-shell-page` with greater specificity than the late global theme bridge. The computed trace showed that Classic dark was correctly applied to the body and workspace cards, but the stream navigation still used the old dark-green hard-coded background and white border. The stream shell background also retained its hard-coded grid even when the selected theme texture was `none`.

The bridge now adds equal-or-greater-specificity rules for stream navigation and stream-shell textures. The shell is plain `var(--bg)` for Classic, Professional, Contrast, and other `none` textures. Grid and scanline textures are reintroduced only through the root `data-theme-texture` attribute.

Community primary controls and avatars no longer force pure white text; they use the semantic theme background for contrast. The pinned badge uses a dark readable foreground against its amber background.

### ServiceWorker delivery

The previous registration query marker remained at `20260826-sw-v34` while the cache had advanced, which could delay activation of updated shell assets. The registration marker is now `20260828-sw-v35`, and the cache is `webman-v39`. This ensures existing browsers can update to the corrected CSS, theme runtime, and shell markup.

## Local computed-style evidence

A Chromium trace was run against the rebuilt production server with Classic dark selected in local storage. The active routes were `/`, `/science`, `/community`, and `/settings#appearance`.

The trace confirmed the following values on all four routes:

```text
data-theme: dark
data-theme-mode: dark
data-theme-texture: none
--bg: #1b1f24
--surface: #262b32
--panel: #2b3138
--fg: #e6edf3
--border: #4b5563
```

Representative computed surfaces were `rgb(27, 31, 36)` for the page, `rgb(38, 43, 50)` for cards and workspace surfaces, and `rgb(48, 54, 61)` for the tree rail. The stream navigation no longer resolves to the former `rgba(2, 5, 4, 0.88)` background, and the Classic stream shell texture computes to `none`.

## Changes made

| Area | Change |
|---|---|
| `public/js/theme.js` | Corrected server dark-mode precedence, made custom-family restoration explicit, and removed duplicate Classic token keys. |
| `src/api/theme.ts` | Made session state authoritative over stale cookies and persisted custom theme mode. |
| `public/html/settings.html` | Replaced misleading labels such as “Classic light” with neutral family names. |
| `public/css/style.css` | Added specificity-safe stream navigation and texture bridges using global theme tokens. |
| `public/css/community.css` | Replaced theme-breaking white foreground declarations with semantic colors. |
| `service-worker.js` | Advanced cache to `webman-v39`. |
| `public/js/sw-register.js` and `public/js/app.js` | Advanced registration marker to `20260828-sw-v35`. |
| Regression tests | Added API, shell, CSS-contract, browser, and cache-version assertions. |

## Validation

The following local checks passed after the changes:

| Check | Result |
|---|---|
| TypeScript typecheck | Passed |
| Full Vitest suite | **114 passed**, 2 database integration tests skipped because they are environment-gated |
| Production build | Passed |
| Release compatibility gate | Passed |
| Chromium browser smoke | Passed |
| Classic dark cross-shell computed-style trace | Passed |
| Dependency audit excluding development dependencies | **0 vulnerabilities** |
| `git diff --check` | Passed |

The changes are source-verified locally. They are not evidence that the public Vercel deployment has already updated; the Vercel project must deploy the final `whoami` commit before production behavior can be judged.

## Remaining audit notes

The stream route continues to load the intentional eager workspace/editor/Markdown stack. This is expected under the project requirement and was not converted to lazy tree loading. Its payload can be optimized later through caching, compression, and deferred noncritical renderer work, but removing eager tree behavior would violate the current architecture requirement.

The dormant `public/html/community.html` and `public/html/volunteers.html` files remain outside the active Vercel route map. They should not be treated as active route owners unless that routing decision changes. The next safe cleanup would be to mark their dormant status clearly in project documentation rather than deleting them without a routing migration.
