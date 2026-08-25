> **Document status:** historical implementation record. For current behavior, use [`docs/README.md`](../../README.md), the root [`README.md`](../../../README.md), and the active architecture/release documents.
>
# File Responsibility Revamp Design

## Objective

The revamp will make every file belong to one clear responsibility boundary. It will not reorganize by filename alone. A file may move, merge, split, or be removed only when its runtime imports, route ownership, build output, generated status, and retained feature status agree.

## Current-to-target ownership model

| Concern | Current owner | Target owner | Structural decision |
|---|---|---|---|
| Landing page shell | `index.html` | Landing shell | Keep as the page shell; move only page-specific behavior out of the monolithic runtime later. |
| Stream workspace shell | `public/html/streams.html` | Stream shell | Keep as the only canonical stream HTML shell. |
| Stream client behavior | `src/client/streams.ts` → `public/client/streams.js` | Stream client module | Keep separate from the general workspace runtime. |
| Main workspace runtime | `public/js/app.js` | Workspace runtime modules | Compatibility bootstrap remains; theme, landing docs, stream runtime, and raw delivery are extracted and delegated, while stateful navigation/workspace/editor splits remain deferred. |
| Raw file delivery | `src/api/raw.ts` | Raw delivery API | Keep independent. It is the dominant file-click delivery path and must not merge with repository discovery. |
| Repository manifest fetching | `src/scripts/json-fetch.ts` | Manifest fetcher | Keep as the sole repository-root `files.json` fetcher. `src/api/pages-fetch.ts` remains a compatibility/fallback adapter until no runtime path needs it. |
| Generated JSON artifacts | `src/scripts/generate-json-files.ts` | Artifact generator | Keep as the sole writer of `public/json/repo-registry.json` and `public/json/<stream>-tree.json`. |
| Runtime stream tree API | `src/api/system.ts` | Stream API | Keep separate from the registry parser and raw delivery; it serves canonical generated artifacts first. |
| Repository registry parsing | `src/api/repo-registry.ts` | Registry/config boundary | Keep as parser, loader, and compatibility endpoint. Do not duplicate registry parsing in the browser. |
| Local project files | `files.json`, `src/api/files-manifest.ts`, local file routes | Local documentation/workspace boundary | Keep separate from remote stream artifacts. Landing documentation consumes local `files.json`. |
| Global theme | `public/css/theme.css` and `public/js/theme.js` | Theme boundary | `theme.css` owns tokens and `theme.js` owns runtime persistence/compatibility functions; Settings uses the shared boundary. |
| Settings | `public/html/settings.html` | Settings feature | Keep page-specific markup isolated; sign-in remains a future integration boundary. |
| Authentication/security | `src/api/auth.ts`, `oauth.ts`, `totp.ts`, `permissions.ts`, browser auth files | Identity/security feature | Retain dormant/guarded; never merge into public stream reads. |
| Community/moderation/editor | `community.ts`, `forum.ts`, `pr-review.ts`, `submit-pr.ts`, editor/upload assets | Future write features | Retain dormant/guarded and separate from read-only stream browsing. |
| PWA | `service-worker.js` | PWA runtime | `service-worker.js` is the sole deployed source; the unreferenced `src/service-worker.ts` variant was removed after build, route, and deployment scans. |
| Server composition | `src/server/server.ts` plus `src/server/*.ts` registration modules | HTTP composition boundary | Keep one Node/Express composition owner; `server.ts` mounts explicit startup, observability, API, public, and workspace modules while Vercel files remain thin adapters. |

## Merge decisions

The following files must not be merged because they own different failure, security, or lifecycle boundaries:

| Files | Reason |
|---|---|
| `json-fetch.ts` and `raw.ts` | Manifest generation is build/startup work; raw delivery is request-time, validated file access. |
| `repo-registry.ts` and `system.ts` | Registry parsing is complete-scope configuration; system is stream-scoped runtime serving/cache behavior. |
| `files-manifest.ts` and generated stream JSON | Local project documentation and remote stream content have different sources and freshness rules. |
| Authentication/security APIs and stream read APIs | Public browsing must remain independent of future sign-in and admin gates. |
| `theme.css` and page-specific CSS | Global tokens need one owner; page styles should consume tokens rather than redefine them. |
| Vercel `api/*` adapters and canonical `src/api/*` handlers | Adapters should remain thin deployment boundaries. |

## Split decisions

`public/js/app.js` remains the compatibility bootstrap and still owns navigation, portal/activity, workspace UI state, previews/editor windows, and update polling. Stable behavior boundaries have been extracted as follows, preserving the current global API during migration:

| Proposed module | Responsibility |
|---|---|
| `public/js/core/navigation.js` | Route transitions, navigation state, portal route selection, and history handling. |
| `public/js/theme.js` | Theme presets, persistence, token application, and Settings controls. **Extracted and verified.** |
| `public/js/landing-docs.js` | Local `files.json` traversal and README/ARCHITECTURE card rendering. **Extracted and verified.** |
| `public/js/stream-runtime.js` | Stream artifact loading, stream mapping, manifest state, and compatibility bridge. **Extracted and verified.** |
| `public/js/raw-delivery.js` | Preview/download orchestration, `/api/raw` preference, and repository/Pages fallbacks. **Extracted and verified.** |
| `public/js/workspace/editor.js` | Existing editor hooks and deferred submission behavior. |
| `public/js/portal/activity.js` | Community/issues feed rendering. |

The remaining navigation, portal/activity, workspace UI-state, and editor splits are deferred until each receives focused tests. The first revamp does not create multiple competing bootstraps.

## Rename and directory decisions

The stream-facing names are canonical: `streams.html`, `streams.ts`, `streams.js`, `streams.css`, `STREAMS`, `stream`, and `stream-tree`. `subject` remains valid only where it is a real academic/community field or an explicitly documented legacy API alias.

Generated artifacts remain in `public/json/`. Vendored assets remain under `public/bin/` and `public/fonts/`; they are not moved into application modules. Dormant identity, community, moderation, editor, and upload files remain in their current locations until those features receive their own activation phase.

## Safe removal candidates

The first removal candidates are files that are unreferenced by package scripts, imports, route mounts, HTML script/link tags, service-worker assets, tests, and deployment adapters:

| Candidate | Initial decision | Removal gate |
|---|---|---|
| `src/scripts/generate-stream-trees.js` | Candidate for removal; superseded by `generate-json-files.ts` | Confirm no CI/deployment/manual script references, then rebuild and regenerate artifacts. |
| `public/html/adminX.html` | Dormant legacy candidate | Confirm no route, static link, service-worker, or collaborator reference. |
| `public/html/communityX.html` | Dormant legacy candidate | Confirm no route, static link, service-worker, or collaborator reference. |
| `public/html/volunteersX.html` | Dormant legacy candidate | Confirm no route, static link, service-worker, or collaborator reference. |
| `src/client/main.ts` / `public/client/main.js` | Do not remove yet | The current landing shell references the generated client artifact; trace and replace the reference first. |
| `src/service-worker.ts` | Removed after reference/build/deployment scan | It was unreferenced; `service-worker.js` is now the sole deployed source and its cache contract is tested. |
| `src/api/pages-fetch.ts` | Retain as compatibility | Remove only after runtime and deployment paths no longer use Pages fallback behavior. |

## Server extraction result

The Express composition root now mounts dedicated modules: `startup.ts` owns development defaults and generated-artifact preparation; `workspace-routes.ts` owns local manifest/file delivery and workspace metadata; `observability.ts` owns metrics, health, and version reporting; `public-routes.ts` owns shell/static/PWA routes; and `api-routes.ts` owns active and dormant API route registration. No dormant identity, community, moderation, editor, or upload module was removed.

## Execution rule

The revamp will be performed in this order: responsibility manifest, reference graph, target module boundaries, one structural change, build/typecheck/tests, runtime smoke test, then the next structural change. A removal manifest will record every deleted file and the evidence used to delete it. No dormant feature is deleted simply because it is not currently mounted.
