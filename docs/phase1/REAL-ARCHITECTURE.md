# NoteBooks Framework — Current Architecture

**Document status:** active source-of-truth architecture map. **Validated against:** the current TypeScript/Express and static-browser implementation on 25 August 2026.

## Executive summary

NoteBooks is a **Node.js and TypeScript Express application with a static vanilla-JavaScript/PWA client**. The server serves HTML shells and APIs from one application. The browser renders Markdown and repository trees, while the server owns registry selection, raw file delivery, authentication boundaries, GitHub writes, database access, Blob staging, and operational checks.

The three public content areas are **Science, Commerce, and Humanities streams**. Community and Issues are separate registry-driven workspaces. The application keeps repository content eager: build-time generators and runtime tree APIs prepare complete stream trees rather than introducing lazy subtree loading.

> **Primary invariant:** `GITHUB-REPOSITORIES.md` defines configured repositories, generated JSON makes that registry available at runtime, and `src/api/raw.ts` remains the dominant and canonical file-byte delivery path.

## 1. System layers

| Layer | Main files | Responsibility |
| --- | --- | --- |
| Browser shells | `index.html`, `public/html/*.html` | Initial HTML, shared navigation, upload/admin/settings surfaces, and stream workspace markup. |
| Browser runtime | `public/js/app.js`, `stream-runtime.js`, `raw-delivery.js`, `theme.js` | Route transitions, eager trees, previews, source/raw controls, Issues evidence, themes, and reader preferences. |
| Markdown runtime | `public/js/markdown.js`, `md-init.js`, `obsidian-markdown-it.js`, `markdown-vendors.js` | Markdown-it parsing, Obsidian compatibility, callouts, math, figures, diagrams, code highlighting, and safe fallbacks. |
| Styling/PWA | `public/css/style.css`, `public/css/tree.css`, `service-worker.js` | Design tokens, reader layout, accessible tree, theme application, caching, offline fallback, and invalidation. |
| HTTP application | `src/server/server.ts`, `src/server/api-routes.ts`, `src/api/*.ts` | Express middleware, route composition, validation, authorization, external integrations, and content APIs. |
| Persistence | `src/lib/db.ts`, `src/db/migrations/*.sql`, optional KV, Vercel Blob | Durable identity/application state, cache state, staged binaries, and safe local fallbacks. |
| External control plane | GitHub, GitHub Pages, Supabase/Postgres, Vercel Blob, email/OAuth providers | Source repositories, PRs/Discussions, database, private uploads, authentication, and deployment. |

## 2. Runtime and build entrypoints

| Mode | Entry | Behavior |
| --- | --- | --- |
| Local development | `npm run dev` | Cleans stale generated JavaScript, runs the full build pipeline, then starts the compiled server on port 4000 unless `PORT` is set. |
| Local production-shaped process | `npm run build && npm start` | Generates all manifests and compiles client/server TypeScript before starting the compiled Express server. |
| Vercel | `api/[...all].ts` | Exports the Express application through the serverless adapter. The Vercel project must be linked to this repository before release. |
| Tests | `npm test` | Runs Vitest; database integration tests require explicit `RUN_DB_INTEGRATION_TESTS=true` and a safe `DATABASE_URL`. |

The build runs `cleanup-stale-src-js.js`, `fmtree.py`, `generate-version.js`, `generate-github-repos.ts`, `generate-json-files.ts`, the client compiler, and the server compiler. A failed remote discovery should not silently replace one stream with another; generated artifacts and documented fallbacks are used instead.

## 3. Browser architecture

### 3.1 Shells and navigation

`index.html` is the public landing shell. `public/html/streams.html` is the shared stream workspace shell. Settings is a personal-space surface, not a generic dashboard that loads a content stream. Admin, Community, Issues, account, and volunteer routes use their dedicated shells or route-specific sections.

`public/js/app.js` is the browser coordinator rather than the owner of every feature. It coordinates route transitions, repository tree display, search, previews, raw/source actions, selected-file state, and the selection-to-suggest evidence flow. Supporting modules own themes, reading preferences, stream setup, and raw delivery. The History API is progressively enhanced, and Home restoration must return the landing shell without requiring a refresh.

### 3.2 Tree and content discovery

At build time, `GITHUB-REPOSITORIES.md` is decomposed into `public/json/github-repos.json`. The runtime uses that generated registry, then `generate-json-files.ts` produces `repo-registry.json` and eager `science-tree.json`, `commerce-tree.json`, and `humanities-tree.json` artifacts. The client attempts the runtime tree API first and uses generated JSON/local artifacts as resilience fallbacks.

A repository is displayed as a folder beneath the stream root. Tree rows are text-first, keyboard navigable, and expandable/collapsible. The current path is preserved in status text and focus state. Community and Issues entries are available through their configured registry paths, but are not inserted into stream content trees.

### 3.3 Markdown and preview

The browser fetches Markdown as text and renders it inside the reader. `markdown.js` separates synchronous HTML generation from optional feature activation. Type-specific previews handle Markdown, images, audio, video, PDF, and office files. The reader provides raw view with line numbers and a toggle, while the source selection flow sends exact evidence to Issues proposals.

## 4. Registry, trees, and raw delivery

### 4.1 Registry-first routing

`GITHUB-REPOSITORIES.md` is human-authored and `public/json/github-repos.json` is its generated machine-readable form. Registry entries include stream/workspace, repository, branch, root, enabled state, priority, and Pages settings. The generated registry is not hand-edited; change the Markdown registry and rerun the generator.

`src/api/repo-registry.ts` combines local `files.json` information with configured remote repositories. `src/api/system.ts` selects repositories by explicit registry configuration, loads a repository `files.json`/Pages manifest when available, falls back to the GitHub tree API, filters supported content, and caches results. Runtime tree reads are eager and concurrent requests are coalesced.

### 4.2 Raw delivery

`src/api/raw.ts` validates repository overrides and paths, constructs the configured raw URL, constrains local paths to the project root, sets content type and cache/isolation headers, and supports same-origin browser delivery. This endpoint is the canonical source path for file clicks and embedded content. Other CDN/Pages helpers are compatibility fallbacks, not parallel authorities.

### 4.3 Refresh and cache layers

The system has three freshness layers: browser/service-worker cache, server process/shared cache, and remote GitHub/Pages content. `/api/system/:stream/refresh` and the signed refresh signal invalidate server-side tree state. `app.js` polls version/update signals and the service worker uses cache version `webman-v31` for the current client contract. Remote raw GitHub/API hosts are not treated as blindly cacheable application shells.

## 5. Authentication, sessions, and authorization

Email/password authentication uses bcrypt, JWTs, optional OAuth linking, and password recovery. Browser continuity uses an opaque `nb_sid` HttpOnly/SameSite cookie when enabled; only a SHA-256 token hash is persisted. Session state includes selected theme family/mode, custom theme tokens, reading preferences, and optional user linkage.

PostgreSQL/Supabase is the intended durable production store. KV and process-memory fallbacks exist for local development or controlled degraded operation; they are not an acceptable substitute for production identity, moderation, or review durability.

| Boundary | Examples | Protection |
| --- | --- | --- |
| Public reads | Landing, registry, stream trees, raw files, version/health | Input validation, path constraints, cache/security headers. |
| Authenticated writes | Account actions, Community posts, Issues proposals | Bearer JWT/session identity and route validation. |
| Strong contributor writes | Blob operations, normalized SVG conversion, editor PR submission | `requireTotpEnrolled` plus bounded rate limiting where applicable. |
| Administrative writes | Moderation, role management, PR review/merge | Role checks and audit/review state. |
| Webhook/refresh writes | GitHub refresh and installation events | Signature/HMAC validation and delivery deduplication. |

## 6. Community and Issues

Community is implemented through the `src/api/community*.ts` family. Channels, messages, reports, profile presence, and moderation state are distinct from curriculum trees. Where configured, GitHub Discussions mirror approved content, but the application database remains the local workflow record.

Issues are source-aware proposals. A user can select a rendered Markdown region or use raw line-numbered view; the client captures repository, branch, path, start/end lines, source text, commit/snapshot metadata, and the suggested change. The server stores proposal/review/lifecycle state and authorized reviewers can create or merge GitHub pull requests through the configured GitHub credentials.

## 7. Upload and diagram conversion

`public/js/upload.js` keeps ordinary uploads unchanged unless the author explicitly chooses Biology or Chemistry normalization. `src/api/blob.ts` protects upload, fetch, delete, and `convert-svg` actions. `src/lib/image-to-svg.ts` validates content type, size, dimensions, and filenames; sanitizes native SVGs; and uses Sharp for raster alpha normalization.

A native sanitized SVG is reported as `mode: vector`. A raster result is an accessible SVG container containing a transparent-background PNG and is reported as `mode: embedded-raster`. It is not true vector tracing. Originals and derivative metadata are retained through anonymous review, preview, download, re-upload, and approval so the extension change is never ambiguous.

## 8. Data and external integrations

| Data | Durable source | Degraded/local behavior |
| --- | --- | --- |
| Curriculum files | Configured GitHub repositories and Pages manifests | Generated registry/tree snapshots and local `files.json`. |
| Users, roles, sessions, themes, Community, Issues, review state | Supabase/PostgreSQL migrations | Explicitly limited volatile fallback in local/test paths. |
| Shared tree cache | Optional KV REST service plus process cache | Process cache and rebuild. |
| Staged binaries | Private Vercel Blob | Clear failure when Blob credentials are absent. |
| GitHub changes | Octokit/GitHub App or PAT/OAuth path | No protected write when required credentials are missing. |
| Reset mail | Resend when configured | Authentication capability is incomplete without delivery configuration. |

## 9. Security and production boundaries

The server keeps secrets off the public web root, validates outbound repository/path inputs, sanitizes native SVG and Markdown-derived URLs, rate-limits expensive conversion/upload operations, and does not expose raw session tokens. Mermaid uses strict security mode. Trusted repository content and user-submitted Markdown must not be conflated; future permissive HTML behavior requires an explicit sandbox or trusted-source boundary.

The current production audit identified two deployment blockers outside the local code suite: the active Vercel project is linked to a different `NoteBooks-Science-Framework` Next.js repository, and the active Supabase database reports RLS disabled on sixteen application tables. RLS must not be enabled blindly without intentional policies because it can block the server’s access path. These findings are recorded in [`docs/phase2-3/FINAL-AUDIT-AND-VERIFICATION.md`](../phase2-3/FINAL-AUDIT-AND-VERIFICATION.md) and the release checklist in [`README.md`](../../README.md).

## 10. Maintainer source of truth

| Question | Source |
| --- | --- |
| What repository/workspace is configured? | `GITHUB-REPOSITORIES.md` and generated `public/json/github-repos.json`. |
| How is a stream tree built? | `src/scripts/generate-json-files.ts` and `src/api/system.ts`. |
| How do file bytes reach the browser? | `src/api/raw.ts` and `public/js/raw-delivery.js`. |
| How are routes assembled? | `src/server/api-routes.ts` and `src/server/server.ts`. |
| How are database changes applied? | `src/db/migrations/*.sql` and `src/scripts/migrate-db.js`. |
| What does the Markdown reader support? | `docs/MARKDOWN-RENDERER.md`, `public/js/md-init.js`, and `public/js/obsidian-markdown-it.js`. |
| What is required for release? | `README.md`, `docs/REMAINING.md`, and `docs/phase2-3/DIAGRAM-ASSET-AND-RENDERER-PLAN.md`. |
