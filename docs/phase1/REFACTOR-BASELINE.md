> **Document status:** historical implementation record. For current behavior, use [`docs/README.md`](../../README.md), the root [`README.md`](../../../README.md), and the active architecture/release documents.
>
# Refactor Baseline and Ownership Rules

## Baseline snapshot

The current project is a Node/Express application with a static browser frontend, generated stream JSON artifacts, local `files.json` documentation metadata, remote repository manifests, a raw-file delivery API, optional PWA caching, and dormant identity/community/editor features.

The current verification baseline is **25 test files and 67 tests passing**, with a successful production build, server/client compilation, and deterministic fmtree integration test. This baseline must remain green after every structural change.

## Canonical responsibilities

| Responsibility | Canonical owner | Required contract |
|---|---|---|
| Landing HTML | `index.html` | Owns home layout and mounts; does not implement remote stream generation. |
| Stream HTML | `public/html/streams.html` | Owns the shared stream workspace shell; stream names remain distinct from academic subjects. |
| Browser bootstrap | `public/js/app.js` during migration | Remains the compatibility bootstrap; stable theme, landing-docs, stream-runtime, and raw-delivery responsibilities now delegate to dedicated modules. |
| Stream client | `src/client/streams.ts` → `public/client/streams.js` | Owns stream shell behavior and stream-specific JSON selection. |
| Theme | `public/css/theme.css` plus extracted theme runtime | Owns global tokens and persistence; page CSS consumes tokens. |
| Local landing documents | `fmtree.py` → root `files.json` → `/files.json` → landing-doc module | Owns local project documentation discovery. |
| Remote stream artifacts | `json-fetch.ts` → `generate-json-files.ts` → `public/json/*` | Owns repository-root `files.json` fetching and generated stream trees. |
| Runtime stream serving | `src/api/system.ts` | Serves canonical generated artifacts and handles controlled refresh compatibility. |
| Raw file access | `src/api/raw.ts` | Validates file identity and delivers raw content; remains the normal preview/download path. |
| HTTP composition | `src/server/server.ts` plus `src/server/{startup,observability,api-routes,public-routes,workspace-routes}.ts` | `server.ts` is the composition root; each extracted module owns one server boundary and is mounted explicitly. |
| PWA | `service-worker.js` | Canonical deployed service-worker source; the TypeScript variant cannot silently diverge. |
| Future identity/write features | Existing dormant API/client modules | Remain isolated and are not pulled into public stream browsing. |

## Refactor invariants

Every extracted module must have one primary responsibility, an explicit public interface, and a documented caller list. The compatibility bootstrap may temporarily re-export or delegate to extracted functions, but duplicate implementations are prohibited.

Generated files are outputs, not source modules. `public/json/repo-registry.json`, `public/json/<stream>-tree.json`, `public/client/*.js`, and `version.json` must be produced by their declared generators and must not be hand-edited as the primary fix.

The refactor must preserve the following public behaviors: `/`, `/science`, `/commerce`, `/humanities`, `/settings`, `/api/registry`, `/api/system/:stream`, `/api/raw`, `/files.json`, `/files/*`, and the existing dormant-feature route protections.

The term **stream** is reserved for Science, Commerce, and Humanities. The term **subject** remains valid for academic-subject data and community/submission database fields. No global search-and-replace is permitted.

No dormant module is removed because it is currently unmounted. Removal requires a reference scan, deployment scan, test scan, explicit classification, and a successful build/test/smoke gate.

## Extraction order

The browser extraction order is theme and local landing documents first, then stream/tree loading, then preview/raw delivery, then navigation and editor/activity boundaries. This order minimizes cross-module coupling and ensures the most stable utility boundaries are established before the largest stateful modules are moved.

The server extraction order is complete for this phase: startup/artifact preparation, local file delivery, health/observability, public shell routes, and API route groups are separate modules. `server.ts` remains the composition root and contains only cross-cutting middleware, module mounting, and lifecycle entrypoints.

The service worker and `fmtree.py` workflow are cross-cutting boundaries. They are reconciled before deleting compatibility sources or changing deployment behavior.

## Verification gates

Each extraction must pass server typecheck, client compilation where applicable, the full Vitest suite, and a runtime smoke check covering the affected route or asset. The browser refactor must additionally verify stream artifact selection, local landing-document rendering, `/api/raw` preference, theme persistence, and mobile/desktop bootstrapping.

The final refactor report must record every created, moved, merged, split, retained, deferred, and removed file, together with its owner and the verification evidence for the decision. This phase records the extracted server modules and removes only the verified one-time migration utilities.
