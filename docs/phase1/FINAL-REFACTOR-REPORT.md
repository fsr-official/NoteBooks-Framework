# Phase-I Refactor Report

## Outcome

The NoteBooks project now has explicit ownership boundaries for the browser runtime, service worker, local documentation manifest, remote stream artifacts, and Express server composition. The refactor was performed incrementally, with each structural extraction followed by typecheck, build, and regression verification. Dormant identity, community, moderation, editor, upload, GitHub App, OAuth, and TOTP capabilities were retained and remain separated from public read-only stream browsing.

The active terminology contract is unchanged: **Science, Commerce, and Humanities are streams**. Academic and community `subject` fields remain valid and were not globally renamed.

## Ownership map

| Boundary | Canonical owner | Responsibility | Status |
|---|---|---|---|
| Browser compatibility bootstrap | `public/js/app.js` | Navigation, stateful workspace behavior, portal/activity, editor windows, update polling, and compatibility delegation | Active; remaining stateful splits deferred until focused tests exist |
| Theme runtime | `public/js/theme.js` plus `public/css/theme.css` | Theme presets, persistence, CSS tokens, Settings controls, and legacy global compatibility functions | Extracted and verified |
| Landing documentation runtime | `public/js/landing-docs.js` | Loads `/files.json` and renders allowlisted local README and architecture documentation | Extracted and verified |
| Stream runtime bridge | `public/js/stream-runtime.js` and `src/client/streams.ts` | Loads explicit stream artifacts and preserves stream-specific runtime compatibility | Extracted and verified |
| Raw delivery runtime | `public/js/raw-delivery.js` and `src/api/raw.ts` | Prefers validated `/api/raw` delivery, with controlled repository/Pages fallbacks | Extracted and verified |
| PWA | `service-worker.js` | Sole deployed worker, cache version, offline fallback, stream artifact caching, Settings/module cache entries, and raw/stream routing | Canonical; `src/service-worker.ts` removed as an unreferenced duplicate |
| Remote stream artifacts | `src/scripts/json-fetch.ts` → `src/scripts/generate-json-files.ts` → `public/json/` | Fetches repository-root manifests and writes `repo-registry.json` plus stream-scoped trees | Canonical |
| Local landing manifest | `fmtree.py` → `files.json` → `/files.json` → `landing-docs.js` | Discovers local Markdown, text, and PDF documentation without overwriting the remote registry | Canonical; `--registry` is explicit opt-in |
| Server startup | `src/server/startup.ts` | Development defaults, JSON generation, and stale-artifact fallback | Extracted and verified |
| Workspace/local files | `src/server/workspace-routes.ts` | Workspace resolution, local manifest responses, safe `/files/*` delivery, and workspace metadata | Extracted and verified |
| Observability | `src/server/observability.ts` | Request metrics, health checks, and version reporting | Extracted and verified |
| Public shell/static routes | `src/server/public-routes.ts` | Landing, Settings, admin shell, stream shell, PWA, and static asset routes | Extracted and verified |
| API route registry | `src/server/api-routes.ts` | Active API endpoints, security guards, and dormant feature route registration | Extracted and verified |
| Express composition root | `src/server/server.ts` | Cross-cutting middleware, module mounting, `createApp`, and `startServer` lifecycle entrypoints | Reduced to composition responsibility |

## Files removed

The unreferenced `src/service-worker.ts` variant was removed after confirming that the deployed route, build graph, tests, and service-worker asset references use `service-worker.js`. The three one-time browser extraction utilities—`scripts/extract-phase2-browser-modules.mjs`, `scripts/extract-stream-runtime.mjs`, and `scripts/extract-raw-delivery.mjs`—were removed after their generated modules were verified and no active references remained. No dormant feature implementation was removed.

## Verification evidence

The final verification sequence completed successfully. It included the dedicated fmtree fixture test, server typecheck, the production build, and the full Vitest suite.

| Check | Result |
|---|---|
| `npx vitest run tests/fmtree.test.ts --reporter=dot` | 1 test passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; local manifest and all four canonical remote JSON artifacts regenerated |
| `npm test -- --reporter=dot` | 25 test files and 67 tests passed |
| Service-worker cache contract | Covered by the existing strengthened service-worker test |
| Server route coverage | Existing workspace, stream, raw, protection, admin, community, registry, and webhook tests remained green |

The fmtree regression test confirms that `README.md` and `docs/archive/ARCHITECTURE.md` are included, while `src`, `public`, `tests`, `index.html`, generated `files.json`, and implicit `repo-registry.json` output are excluded from the local landing manifest.

## Known follow-up

The Commerce source repository currently returns HTTP 404 for its root `files.json`. The remote generator therefore preserves the existing Commerce tree snapshot rather than replacing it with invalid data. The correct follow-up is to repair the repository, branch, or root path in `GITHUB-REPOSITORIES.md` or restore that repository’s root manifest. The stale-artifact fallback remains intentional until the source is repaired.

The next structural phase should focus on the remaining stateful browser boundaries—navigation, portal/activity, workspace UI state, preview/editor windows, and update polling—one at a time with focused tests. The Pages-fetch implementation and shim should also be reconciled only after all runtime and Vercel import paths are mapped. These follow-ups must not pull dormant identity or community features into the public stream read path.
