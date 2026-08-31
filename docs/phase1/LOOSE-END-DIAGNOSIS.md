> **Document status:** historical implementation record. For current behavior, use [`docs/README.md`](../../README.md), the root [`README.md`](../../../README.md), and the active architecture/release documents.
>
# Loose-End Diagnosis

## Executive assessment

The project is now buildable and testable, but it still has several **ownership and lifecycle loose ends**. The most important problems are not individual bugs; they are competing sources of truth. The current project contains a monolithic browser runtime, a monolithic server composition file, two manifest-fetching layers, two service-worker source variants, two deployment graphs, and an automation workflow that still uses the older `fmtree.py` model while the application uses the canonical TypeScript JSON generator.

The recommended order is to resolve ownership ambiguity before attempting broad file movement. A file should be split only after its boundary is covered by a focused test, and a file should be deleted only after the same reference and deployment scan used during the previous cleanup.

## Priority 0: files requiring immediate care

| Files | Why they are loose ends | Recommended care |
|---|---|---|
| `public/js/app.js` | At approximately 2,264 lines, it owns navigation, stream loading, workspace state, preview/download orchestration, raw delivery preference, theme persistence, landing documentation, community activity, and several legacy hooks. It is the largest frontend ownership collision. | Do not rewrite wholesale. Add focused tests and extract one boundary at a time: theme, local landing docs, stream tree loading, preview/raw delivery, then navigation. Preserve the existing global API during migration. |
| `src/server/server.ts` | At approximately 670 lines, it owns startup generation, static/HTML routing, API composition, compatibility routes, theme endpoints, file serving, and deployment behavior. | Keep as the composition root, but move route groups into explicitly named route modules only after route tests exist. Document Node versus Vercel behavior. |
| `src/api/pages-fetch.ts`, `src/shims/pages-fetch.ts`, `src/api/repo-registry.ts`, `src/api/system.ts`, `src/scripts/json-fetch.ts` | There are multiple manifest/tree-fetch paths. `json-fetch.ts` is canonical for startup generation, but runtime compatibility code still imports Pages/raw helpers through both `src/api/pages-fetch.ts` and `src/shims/pages-fetch.ts`. | Establish one shared fetch/normalization contract. Keep compatibility wrappers temporarily, but make the wrapper direction explicit and remove duplicate tree-building logic only after all callers migrate. |
| `service-worker.js`, `src/service-worker.ts` | The deployed worker is `webman-v10`, while the TypeScript source still declares `webman-v9`. This creates source-of-truth and cache-invalidation risk. | Decide which file is canonical. Generate the deployed worker from that source or mark the second file explicitly as non-built reference code. Add a test that checks the canonical cache version and required stream/settings assets. |
| `.github/workflows/fmmupdate.yaml`, `fmtree.py`, `files.json`, `src/scripts/generate-json-files.ts` | CI still runs `fmtree.py` and commits `files.json`, while Phase I generation uses repository-root remote `files.json` manifests and writes `public/json/*`. These are different content models with overlapping names. | Decide whether `fmtree.py` remains the authoritative local-manifest producer. If yes, document the boundary; if no, replace the workflow with the canonical generator. Do not delete either until CI behavior is confirmed. |
| `public/json/commerce-tree.json` | The configured Commerce repository currently returns `404` for its root `files.json`; the artifact is therefore a preserved stale snapshot rather than fresh content. | Fix the repository path/branch or restore its root manifest. Keep stale preservation, but surface freshness metadata to the UI and monitoring. |
| `api/[...all].ts`, `api/system/[stream].ts`, `api/system/[stream]/refresh.ts`, `src/server/server.ts` | The project has both Vercel serverless adapters and a Node/Express server. A route can appear correct locally while diverging in Vercel behavior. | Create a route contract matrix and run the same endpoint tests through both adapters before moving server code. |

## Priority 1: files requiring careful structural treatment

| Files | Diagnosis | Recommended care |
|---|---|---|
| `public/html/streams.html`, `src/client/streams.ts`, `public/client/streams.js`, `public/css/streams.css` | This is the canonical stream surface, but it still shares much of its behavior with `app.js` and retains compatibility hooks. | Keep the four-file stream boundary. Move stream-only loading/rendering into `streams.ts` or a tested workspace module; do not reintroduce subject terminology. |
| `public/js/markdown.js`, `public/js/md-init.js`, `public/js/obsidian-markdown-it.js`, `public/bin/tikzjax/*`, `public/js/markdown-editor.js` | Markdown preview, initialization, vendor plugins, TikZ runtime assets, and editing are adjacent but have different runtime and security profiles. | Separate preview, vendor, and editor ownership. Do not merge vendor assets into application code. Verify PDF/TikZ/Markdown previews after any move. |
| `public/js/auth.js`, `public/js/modern-auth.js`, `src/api/auth.ts`, `src/api/oauth.ts`, `src/api/totp.ts`, `src/lib/permissions.ts`, `src/lib/db.ts` | Identity has multiple browser/server layers, but sign-in is intentionally deferred and some TOTP handlers are not mounted as public routes. | Retain as a dormant identity subsystem. Before activation, define one auth client, one session/token model, one enrollment route, and one Settings integration. |
| `src/api/community.ts`, `src/api/forum.ts`, `src/api/pr-review.ts`, `src/api/submit-pr.ts`, `public/js/upload.js`, `public/js/markdown-editor.js` | These are future write/moderation features with database, GitHub, and permission dependencies. `forum.ts` is implemented but not mounted. | Keep isolated and dormant. Do not merge them into stream read delivery. Activate only as a separate phase with end-to-end authorization tests. |
| `public/client/main.js`, `src/client/main.ts`, `public/js/config.js` | The landing shell references the generated client artifact, while the main behavior remains in `app.js`. This makes the client bootstrap boundary unclear. | Trace the artifact’s actual runtime contribution. Either make it the single landing bootstrap or remove the redundant generated entrypoint after replacing its reference and testing the landing page. |
| `tests/raw.js`, `tests/check_stream_render.js` | These are standalone JavaScript checks and are not part of the normal `vitest run` suite in the same way as the `.test.ts` files. | Convert them into explicit npm scripts or migrate their important assertions into the standard suite. Keep browser smoke coverage separate but visible in CI. |
| `src/lib/schemas/flashcard.json`, `src/lib/schemas/quiz.json` | The schemas currently have no references in the scanned application graph. | Keep only if the planned AI/learning feature will consume them. Otherwise mark them as deferred assets and remove them with a documented decision. |
| `installer.html` | It is a large standalone onboarding/install surface with its own styling system and no demonstrated connection to the main app shell. | Keep isolated until installation is a supported product flow. Do not merge its CSS or markup into the application shell. |
| `public/bin/tikzjax/tex.wasm.gz`, `public/bin/tikzjax/output/tex.wasm.gz` | These two files are byte-identical, but their paths may be required by different runtime configurations. | Treat as a possible storage duplication, not a safe deletion. Confirm every path reference and TikZ runtime test before deduplicating. |

## Priority 2: cleanup candidates and hygiene issues

| Files | Diagnosis | Recommended care |
|---|---|---|
| `.env` | Local environment file. It is empty in the inspection workspace but must never be part of source handoff or version control. | Keep ignored locally; verify it is not tracked and never package it. |
| `logs/admin-actions.log` | Runtime output, not source. | Exclude from source packages and define log rotation/external logging for deployment. |
| `docs/REMAINING.md`, `docs/PHASE-PLANS.md`, `docs/phases/*`, `docs/phase1/*` | Documentation has accumulated across multiple cleanup passes. Some files are historical evidence, while others may be treated as current plans. | Declare one current roadmap and one current architecture document. Move historical reports to an archive and mark them as non-authoritative. |
| `public/html/admin.html`, `public/html/community.html`, `public/html/volunteers.html` | Legacy wrappers still load the stream controller even though their feature semantics are dormant. | Keep until each future feature receives its own shell, then either make the wrapper explicit or retire it. |
| `src/shims/pages-fetch.ts` | Compatibility shim exists beside the real Pages fetch module. | Retain during migration, but add a deprecation comment and a caller inventory. Remove only when no adapter imports it. |
| `src/scripts/cleanup-stale-src-js.js` | Build hygiene script runs on every build and may hide stale generated-source problems. | Keep, but make its deletion report visible in CI and ensure it cannot silently remove a needed generated asset. |
| `zipCreate.sh` | Release helper with unclear current invocation. | Keep if used by release operations; otherwise remove after checking CI and maintainer workflows. |

## Intentionally not loose ends

The following are **not** loose ends merely because they are not currently active: authentication, OAuth, TOTP, database migrations, community moderation, forum, PR review, content submission, upload, and GitHub App modules. They are intentionally dormant future subsystems. Their care requirement is architectural isolation and explicit activation gates, not immediate deletion.

Likewise, `subject` references inside community records, submission helpers, and academic-subject data are valid domain fields. They should not be renamed to `stream`.

## Recommended next execution sequence

| Order | Work package | Exit condition |
|---:|---|---|
| 1 | Reconcile the two service-worker sources | One canonical source and one verified cache version. |
| 2 | Reconcile the local `files.json` workflow with the canonical remote stream generator | CI, startup generation, and landing-page local docs have documented non-overlapping ownership. |
| 3 | Consolidate manifest/tree fetch normalization | One normalization contract with compatibility wrappers covered by tests. |
| 4 | Establish route parity between Node and Vercel adapters | The same stream, Settings, registry, raw, and refresh contracts pass through both deployment paths. |
| 5 | Split `app.js` test-first | Each extracted module has a focused test and the landing/stream workspace behavior remains unchanged. |
| 6 | Normalize test discovery and documentation authority | Browser smoke tests run through explicit scripts/CI, and one roadmap/architecture document is authoritative. |

## Bottom line

The project does not need another broad deletion pass yet. The most valuable care is to resolve **competing sources of truth**: service-worker source, manifest generation, runtime fetch layers, deployment adapters, and the monolithic browser/server composition files. Once those boundaries are explicit, the remaining dormant and optional files can be reviewed safely without risking the active stream browser.
