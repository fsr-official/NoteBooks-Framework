# Homepage Performance and Reliability Postmortem

**Status:** locally verified after the v22 client/cache update  
**Scope:** homepage startup, public shell reliability, browser console errors, static asset delivery, and related hardening findings.

## Confirmed root causes

The original homepage had a permanent splash-screen logic defect. The splash was hidden only inside `fetchTree()`. The DOM bootstrap always awaited `fetchConfig()`, but it called `fetchTree()` only when the current route was a stream route. The root route is a portal route, so the homepage never reached the only splash-hide path. The visible landing page was therefore covered by the loading overlay even though the static landing HTML was already present.

The homepage also loaded several expensive rendering libraries on every visit: TikZJax, Mermaid, MathJax, highlight.js, Desmos, and Google reCAPTCHA. These libraries are needed for document previews or authentication actions, not for the static landing shell. The first audit measured approximately 8.5 MiB of total transfer, 35.0 seconds to First Contentful Paint, 43.3 seconds to Largest Contentful Paint, and 45.4 seconds to Interactive. Lighthouse attributed approximately 1.5 seconds of blocking impact to MathJax and Mermaid alone in the throttled run, with TikZJax transferring roughly 2.9 MiB and the original 1024px favicon transferring roughly 1.4 MiB.

A separate browser-console defect was confirmed: `stream-runtime.js` and the generated `public/client/streams.js` both declared the global lexical constant `STREAM_ARTIFACTS`. Because both scripts are loaded by the homepage, Chromium reported `SyntaxError: Identifier 'STREAM_ARTIFACTS' has already been declared`.

## Implemented corrections

| Change | Implementation | Reason |
|---|---|---|
| Common splash control | Added idempotent `hideSplash()` and reveal the root/public portal shell after initial local rendering. | Prevents portal routes from depending on workspace-tree completion. |
| Immediate app boot | Replaced the homepage’s dependency on `DOMContentLoaded` with bottom-of-body bootstrap after required DOM nodes exist. | Avoids waiting for unrelated deferred library execution before basic shell initialization. |
| Configuration timeout | Added a 2.5-second abort boundary to the shared `/api/config` request. | A slow configuration endpoint cannot hold startup indefinitely. |
| Lazy Markdown vendors | Added `public/js/markdown-vendors.js`; MathJax, Mermaid, TikZJax, Desmos, and highlight.js now load only when a rendered document contains the corresponding feature. | Removes unused multi-megabyte work from homepage startup while retaining preview features. |
| Lazy reCAPTCHA | Moved Google reCAPTCHA script loading into the authentication path. | Authentication protection remains available without paying the third-party cost on every visit. |
| Duplicate declaration fix | Renamed the authoritative TypeScript client constant to `STREAM_SHELL_ARTIFACTS`; the generated JavaScript now preserves the change. | Removes the confirmed browser `SyntaxError`. |
| Favicon optimization | Generated `public/favicon-128.png` at 5.8 KiB and updated the page and manifest references. | Removes the 1.4 MiB original favicon from the critical path. |
| Compression | Added Express compression middleware. | Local responses now advertise Brotli when the client accepts it. |
| Static caching | Added one-hour cache plus stale-while-revalidate for public CSS, JS, fonts, and image assets. | Reduces repeat navigation cost without making HTML or raw content immutable. |
| API parse errors | Added JSON error middleware for malformed `/api/*` bodies. | API clients now receive a consistent JSON 400 response. |
| Admin accessibility | Added explicit `for`/`id` associations to audited admin controls. | Removes the static scanner’s missing-label findings. |
| Cache release | Bumped the service worker to `webman-v22` and added the vendor loader/optimized icon to the shell. | Ensures existing clients receive the new client contract. |

## Measured outcome

The local Lighthouse runs used the same production-shaped server and a headless Chromium profile. Results vary slightly with CDN timing, but the direction is substantial.

| Metric | Initial audit | After splash/defer | After lazy vendors | Final v22 diagnosis run |
|---|---:|---:|---:|---:|
| Performance score | 0.37 | 0.44 | 0.71 | **0.89** |
| First Contentful Paint | 35.0 s | 2.6 s | 2.6 s | **2.6 s** |
| Largest Contentful Paint | 43.3 s | 13.4 s | 9.8 s | **3.2 s** |
| Time to Interactive | 45.4 s | 34.3 s | 9.8 s | **3.2 s** |
| Total Blocking Time | 730 ms | 1,710 ms | 30 ms | **0 ms** |
| Total transfer | 8,499 KiB | 6,768 KiB | 1,661 KiB | **298 KiB** |
| Accessibility score | not recorded in initial summary | 1.00 | 1.00 | **1.00** |
| Best-practices score | not recorded in initial summary | 0.79 | 0.96 | **1.00** |

The final browser pass reported no application `SyntaxError`, `ReferenceError`, `TypeError`, or `Uncaught` entries. Chromium still emits a DBus/UPower environment warning in the sandbox; that is host noise rather than a NoteBooks application error. The final route smoke test returned 200 for `/`, `/settings`, `/community`, `/issues`, and `/admin-prs`, while `/dashboard` returned the intended 302 redirect to `/settings#personal-space`. Static public assets returned Brotli when requested, and malformed JSON returned `{"error":"Malformed JSON request body"}` with HTTP 400.

## Remaining security and reliability work

The current CSP still allows `'unsafe-inline'`, inline script attributes, `blob:`, and several third-party origins. This is a known legacy-frontend trade-off rather than a newly introduced defect. The next hardening step should remove inline handlers and migrate to nonce/hash-based policies, then narrow the allowlist once TikZJax, Mermaid, Desmos, reCAPTCHA, and Markdown preview behavior are covered by tests.

Rate limiting is partially present for authentication and PR submission, but not standardized across Community writes, Issue proposals, comments, votes, moderation, reviewer decisions, and PR attempts. Add route-specific limits keyed by authenticated user with an IP fallback before production activation. The global 25 MiB JSON parser limit should also be replaced with smaller route-specific limits, with a separate storage/upload path for genuinely large content.

Mermaid is initialized with `securityLevel: 'loose'`. Because Markdown may contain repository or user-controlled content, this should be reviewed as an explicit trust-boundary decision. Prefer strict rendering or a sandboxed preview context unless the project can prove that all rendered diagram sources are trusted and safely escaped.

The dependency advisory audit remains unverified because `npm audit --omit=dev --json` did not produce a usable result in the sandbox. Re-run it in CI with registry access and preserve the advisory report. Production Vercel compression/cache behavior, deployed environment variables, Supabase runtime connectivity, OAuth/TOTP, GitHub scopes, webhook delivery, and live Octokit PR creation remain outside this local diagnosis.

## Verification evidence

The final verification pass recorded **30 test files and 86 tests passed**, together with successful typecheck, client/server builds, JavaScript syntax checks, route smoke checks, and the accessibility scan. The detailed raw Lighthouse JSON, browser console capture, HTTP evidence, and screenshot are stored with the audit delivery bundle outside the source archive.
