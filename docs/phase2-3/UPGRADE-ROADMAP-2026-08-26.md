# NoteBooks Framework Upgrade Roadmap

**Audit baseline:** `1a7ecca` on `whoami`
**Date:** 2026-08-26
**Scope:** Upgrade opportunities discovered after the website-wide navigation, movement, performance, stability, and security audit.

## Executive recommendation

The framework is currently in a stable enough state for **controlled incremental upgrades**, but a broad dependency upgrade should not be performed as one operation. The highest-risk parts are the Vercel serverless runtime, Octokit, TOTP, the eager stream-artifact pipeline, the legacy explorer client, and database-backed session/authentication paths. The recommended approach is to preserve the current route and eager-loading architecture while upgrading one boundary at a time with a green test/build/deployment gate after each phase.

The current branch is clean and includes the generated `files.json` workflow commit. No upgrade should begin by changing the core navigation or stream loading strategy again; those boundaries have just been stabilized.

## Current dependency drift

The fresh `npm outdated --json` baseline reported the following differences:

| Package | Current | Latest reported | Recommendation | Priority |
|---|---:|---:|---|---|
| `resend` | 6.22.0 | 6.22.1 | Safe patch upgrade after checking email tests. | Low |
| `@types/node` | 26.2.0 | 26.3.0 | Safe type-only patch upgrade; validate TypeScript. | Low |
| `@octokit/rest` | 20.0.2 | 22.0.1 | Do not upgrade directly. v22 is ESM-only and previously caused Vercel CommonJS startup failure. Requires an explicit server bundle/runtime migration. | High |
| `@octokit/auth-app` | 6.0.0 | 8.3.0 | Do not upgrade directly. Validate ESM behavior and Octokit compatibility together with `@octokit/rest`. | High |
| `otplib` | 12.0.1 | 13.5.0 | Do not upgrade directly. v13 previously pulled an ESM-only `@scure/base` path into the Vercel runtime. Requires a dedicated TOTP migration and deployment test. | High |

`npm audit --omit=dev` currently reports **zero vulnerabilities**. A package being behind latest is therefore not, by itself, a release blocker.

## Priority upgrade backlog

| Priority | Upgrade | Why it matters | Proposed treatment |
|---|---|---|---|
| P0 | Preserve serverless module compatibility | Octokit and TOTP have already caused real production function startup failures. | Add a dependency compatibility gate that runs the built Vercel function artifact under Node 22 before any runtime package upgrade. Keep exact versions until that gate exists. |
| P0 | Make CSRF protection production-complete | `ENFORCE_CSRF` is currently opt-in, and the browser clients do not consistently send a double-submit token. | Add a non-HttpOnly CSRF cookie, a shared client request helper that sends the matching header for mutations, explicit webhook/server-to-server exemptions, and integration tests. Enable by default in production only after all mutation clients pass. |
| P0 | Verify Supabase RLS table by table | Prior audits found disabled RLS and tables with no policies. | Create an inventory migration and policy matrix. Enable RLS only per table after testing public reads, authenticated writes, moderator actions, and admin actions. Do not blanket-enable. |
| P1 | Replace inline event handlers in the legacy explorer | CSP still needs `'unsafe-inline'` because the root shell contains inline handlers. | Move handlers into a dedicated external controller in small groups, add behavior tests, then remove `script-src-attr 'unsafe-inline'` and eventually inline script allowance where possible. |
| P1 | Introduce a typed client request layer | Fetch calls currently use different timeout, auth, error, and retry conventions. | Add one small browser request module for JSON, timeout, abort, CSRF, credentials, and safe error normalization. Migrate Settings and portal clients first, then explorer clients. |
| P1 | Reduce registry payload cost without lazy-loading trees | `/api/registry` is approximately 2 MB locally, while eager stream artifacts are a project requirement. | Keep eager stream artifacts, but split registry metadata from file children, compress responses, add immutable build artifacts, and measure transfer/decode time before and after. |
| P1 | Add browser-level route regression testing | Server tests prove shell contents but not real back/forward navigation, mobile menu behavior, focus, or duplicate network requests. | Add Playwright or equivalent browser tests for Home → Science → Home, Settings hash sections, mobile menu, reload, back/forward, and one-boot assertions. Run them against the production build. |
| P1 | Add automated accessibility checks | Current markup has useful labels and focus styles, but there is no automated WCAG regression gate. | Add axe-based smoke checks for every shell, keyboard navigation tests, focus visibility checks, landmark checks, and color-contrast review. |
| P2 | Upgrade Octokit/auth-app | Newer versions provide current API behavior but threaten the serverless module boundary. | Create a separate branch, upgrade both packages together, replace opaque/lazy loading with a tested ESM-compatible bundle if needed, run Vercel-style startup smoke tests, then canary deploy. |
| P2 | Upgrade otplib | Newer TOTP APIs may improve maintenance posture but require the v12-to-v13 API and dependency migration. | Add RFC-compatible token fixtures, migrate the wrapper behind the existing `src/api/totp.ts` interface, test Node 22/Vercel startup, and canary deploy. |
| P2 | Move Node runtime baseline toward Node 24 | Node 22 is the current project contract; Node 24 should be evaluated as a planned runtime upgrade, not mixed into unrelated changes. | First make CI/build matrices explicit for Node 22 and Node 24, then switch Vercel only after all serverless and native dependency checks pass. |
| P2 | Replace external CDN runtime dependencies selectively | Markdown, diagram, and rendering libraries are loaded from multiple CDNs and can fail independently or violate stricter CSP goals. | Keep the mature renderer behavior, but evaluate bundling only the critical above-the-fold renderer dependencies and retaining optional diagram engines as controlled assets. |
| P3 | Remove dormant compatibility code | The repository intentionally retains dormant files from earlier phases, including `public/client/streams.js` and `public/client/main.js`. | Do not delete immediately. First mark ownership and prove no runtime references through a release audit; remove only in a dedicated cleanup change. |
| P3 | Improve observability | Analytics and Speed Insights are installed, but there is no unified client error/performance event contract. | Add sanitized route-transition, shell-boot, API-timeout, and renderer-error events with no user content, tokens, email addresses, or source text. |

## Staged implementation plan

### Phase A — Establish upgrade gates

Create a repeatable release gate that installs from the lockfile, runs typecheck and tests, builds the production artifact, executes the serverless startup smoke test, audits dependencies, checks route shell markers, and verifies that generated artifacts are synchronized. Add Node 22 as the required baseline and optionally test Node 24 in parallel without switching production yet.

**Acceptance criteria:** the gate runs locally and in GitHub Actions; a built serverless function starts without ESM/CommonJS errors; route and security regression tests pass; the working tree remains clean after build artifact reconciliation.

### Phase B — Complete request and CSRF boundaries

Introduce the shared typed browser request helper. Add CSRF cookie issuance and header propagation for same-origin mutations. Migrate Settings, portal, profile, issue, theme, and reading-preference writes. Keep bearer-authenticated server-to-server paths explicitly exempt and test every exemption.

**Acceptance criteria:** production defaults to CSRF enforcement; legitimate browser mutations pass; cross-site mutation attempts fail; webhook and bearer-authenticated server paths remain functional; no token or user content is logged.

### Phase C — Supabase policy hardening

Inventory every table, intended public read, authenticated write, moderator write, and admin write. Write table-specific RLS policies and integration tests. Roll out in small migrations with rollback notes.

**Acceptance criteria:** no unexplained disabled RLS remains; public feed reads still work; unauthorized writes fail; role boundaries pass integration tests; admin operations remain usable.

### Phase D — Browser navigation and accessibility gate

Add real browser tests against a production build. Test all top-level routes, Home → stream → Home, back/forward, Settings hash navigation, mobile menu, reload, and stale ServiceWorker recovery. Add axe checks and keyboard focus assertions.

**Acceptance criteria:** one visible shell per route, one navigation owner per shell, no duplicate boot network requests, no layout-breaking movement, and no new serious accessibility violations.

### Phase E — Payload and renderer performance

Measure transfer size, decompression, JSON parse, and first meaningful render separately. Preserve eager stream-tree loading while optimizing registry metadata, immutable artifact caching, compression, and renderer dependency delivery.

**Acceptance criteria:** performance budgets are recorded for each shell; Settings remains lightweight; stream trees remain eager; registry transfer and parse costs improve without changing behavior.

### Phase F — High-risk dependency canaries

Upgrade Octokit/auth-app together in one canary branch, then otplib separately. Run the Vercel-style startup smoke test and full integration suite for each. Do not combine either with Node runtime changes or renderer changes.

**Acceptance criteria:** no serverless startup regression, all GitHub/TOTP fixtures pass, deployment logs show no module-format errors, and rollback is one commit away.

### Phase G — CSP and dormant-code cleanup

After browser tests and handler migration are mature, remove inline event handlers in bounded groups. Only then tighten CSP. Separately remove dormant clients after reference analysis and one release cycle of telemetry.

**Acceptance criteria:** CSP no longer requires unnecessary inline allowances, all shell interactions remain functional, and dormant-code removal has no runtime reference failures.

## Upgrade operating rules

The project should not upgrade every package to latest simultaneously. Exact pins are justified for dependencies that previously caused production startup failures. Every high-risk upgrade must be isolated, tested against the built artifact, deployed to a canary or staging target, and followed by a production log check.

The eager stream-tree requirement remains a product constraint. Performance work should optimize artifact generation, compression, parsing, caching, and shell boot—not turn Science, Commerce, or Humanities into lazy-loaded trees.

The next recommended implementation is **Phase A followed by Phase B**, because the upgrade gates and request/CSRF boundary make later security and dependency work safer. Supabase RLS should proceed as a parallel release workstream only when the table policy inventory is available.
