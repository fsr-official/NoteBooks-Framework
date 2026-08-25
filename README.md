# NoteBooks Framework 

NoteBooks Framework is the framework-light educational knowledge platform used to organize, read, discuss, review, and publish curriculum-aligned study material. The current application serves Science, Commerce, and Humanities as **streams**. Community and Issues are registry-driven workspaces, not additional content-tree streams.

> **Release position:** the source is maintained as a v1.0.0 candidate, but production release should wait for the explicit release gates in this document. In particular, the production Supabase project currently reports disabled Row Level Security on several application tables, and the currently linked Vercel project points to a different repository and Next.js project. Those are deployment-configuration blockers, not reasons to hide the findings.

## Source project and collaboration acknowledgement

The foundational project direction and parts of the early application structure were taken from [Pratyush-Chanda/Ada](https://github.com/Pratyush-Chanda/Ada). NoteBooks also acknowledges the help and collaboration of **Pratyush Chanda** within the NoteBooks Project. The current repository has since been reorganized around its own Express, static-browser, registry, raw-delivery, community, Issues, authentication, and persistence boundaries; attribution to Ada does not mean that the current repository is an unchanged copy or that Ada is responsible for NoteBooks behavior.

The project is maintained within the FSR/NoteBooks initiative. External visual assets are credited independently in [`public/assets/diagrams/starter/ATTRIBUTIONS.md`](public/assets/diagrams/starter/ATTRIBUTIONS.md), including the required CC BY-SA 3.0 attribution for the biological-cell and fractional-distillation assets.

## What the application does

NoteBooks provides a public landing page, stream workspaces, a Markdown reader, raw source delivery, repository tree navigation, authenticated community features, Issues proposals, administrative review, theme and reading preferences, anonymous upload staging, and GitHub-backed publication workflows.

The core content rule is simple: **GitHub repositories are the source of curriculum files; generated manifests make discovery fast and resilient; `raw.ts` remains the canonical file-byte delivery path.** The application does not silently turn Community or Issues into content streams, and it does not introduce lazy subtree loading. Stream artifacts are generated eagerly at build/startup and are available as runtime or static fallbacks.

| Surface | Purpose | Canonical implementation |
| --- | --- | --- |
| Home | Public landing page using local manifests and project documentation | `index.html`, `public/js/landing-docs.js`, `public/json/files.json` |
| Science, Commerce, Humanities | Eager repository workspaces and expandable file trees | `public/html/streams.html`, `public/js/stream-runtime.js`, `public/json/*-tree.json` |
| Community | Channels, posts, profiles, moderation, and GitHub Discussion integration | `src/api/community.ts`, `src/api/community-channels.ts`, `src/api/community-profile.ts` |
| Issues | Source-linked change proposals, evidence lines, review, and PR lifecycle | `src/api/issues.ts`, `src/api/issue-review.ts`, `src/api/pr-review.ts` |
| Settings | Personal dashboard space, themes, light/dark mode, and reading controls | `public/html/settings.html`, `public/js/theme.js`, `public/js/reading-preferences.js` |
| Admin | Moderation, upload review, role management, and GitHub controls | `public/html/admin.html`, `public/js/admin-dashboard.js` |

## Architecture at a glance

NoteBooks is a Node.js/TypeScript Express application with a static vanilla-JavaScript browser client. It is not a React application. The same Express composition is used for a local Node process and the Vercel catch-all adapter.

```text
Browser shells and static assets
        │
        ├── app.js / stream-runtime.js / raw-delivery.js / theme.js
        ├── markdown.js / md-init.js / obsidian-markdown-it.js
        └── service-worker.js
        │
        ▼
Express application
        │
        ├── registry and system tree APIs
        ├── raw file delivery and local-file safeguards
        ├── auth, sessions, TOTP, permissions, and CSRF checks
        ├── Community, Issues, review, and GitHub operations
        └── Blob upload staging and image-to-SVG normalization
        │
        ├── PostgreSQL/Supabase for durable application state
        ├── optional KV/cache for shared tree caching
        ├── Vercel Blob for private staged binary files
        └── GitHub repositories, Pages, Discussions, and pull requests
```

### Request entrypoints

| Runtime | Entry point | Responsibility |
| --- | --- | --- |
| Local development/start | `src/server/server.ts` | Loads/generated artifacts, creates Express, serves static files, and listens on `PORT` (default `4000`). |
| Vercel | `api/[...all].ts` | Creates the same application as a serverless handler. Route shims exist for selected deployment paths. |
| Build | `package.json` `build` script | Cleans stale generated JavaScript, runs `fmtree.py`, writes version and registry artifacts, fetches/generates stream trees, then compiles client and server TypeScript. |

### Repository registry and eager trees

`GITHUB-REPOSITORIES.md` is the human-maintained registry. `npm run generate:github-repos` decomposes it into `public/json/github-repos.json`, which is used as the machine-readable registry instead of reparsing Markdown during every request. `npm run generate:json-files` then creates the combined registry and eager stream trees.

Each stream tree is rooted with its repository name and includes repository-relative file metadata and precomputed raw URLs where available. Runtime `/api/system/:stream` discovery is the authoritative freshness path; generated JSON is the deployment and offline fallback. Commerce is intentionally represented as an empty configured repository when its upstream content root is empty or unavailable, rather than receiving stale Science or Humanities content.

### Raw delivery dominance

A file click is handled by the browser preview flow and ultimately resolves through `src/api/raw.ts` or an equivalent canonical raw URL. `raw.ts` validates the selected repository/path, constrains local file resolution to the project root, sets an appropriate content type, and provides the same-origin boundary needed for previews. Other preview helpers exist for compatibility, but they do not replace raw delivery as the primary source path.

## Project structure and file responsibilities

| Path | Responsibility |
| --- | --- |
| `index.html` | Main public shell, navigation, upload overlay, and shared client script loading. |
| `public/html/streams.html` | Eager stream workspace shell with tree rail and reader area. |
| `public/html/settings.html` | Settings and personal-space surface for themes and reading controls. |
| `public/html/admin.html` / `public/html/portal.html` | Administrative and workspace portal shells. |
| `public/js/app.js` | Main browser controller: routing transitions, tree navigation, search, previews, raw/source controls, Issues evidence, and shared UI state. |
| `public/js/stream-runtime.js` | Stream-specific shell initialization and eager artifact selection. |
| `public/js/raw-delivery.js` | Raw/source delivery helpers and line-numbered raw view integration. |
| `public/js/upload.js` | Admin GitHub upload, anonymous Blob staging, review metadata, approval, re-upload, and optional diagram conversion. |
| `public/js/markdown.js` | Two-phase Markdown rendering entry point and post-render feature initialization. |
| `public/js/md-init.js` | Markdown-it setup, safe figure fences, specialized-fence delegation, and Mermaid initialization. |
| `public/js/obsidian-markdown-it.js` | Wikilinks, embeds, callouts, tasks, tags, math, Mermaid/TikZ/Desmos fence support, and heading anchors. |
| `public/js/theme.js` | Built-in/custom theme catalog, paired light/dark modes, persistence, and CSS token application. |
| `public/js/reading-preferences.js` | Session-backed reader font scale, width, line spacing, code wrapping, and reduced-motion preferences. |
| `public/css/style.css` | Global tokens, reader typography, note-oriented headings, figures, callouts, raw view, and dialogs. |
| `public/css/tree.css` | Text-first accessible tree rows, focus/current states, indentation, and navigation affordances. |
| `service-worker.js` | Application shell cache, offline fallback, stream raw routing, network-first manifests, and cache invalidation. |
| `src/server/server.ts` | Express middleware, CSP/COOP/COEP headers, static serving, body parsing, and application composition. |
| `src/server/api-routes.ts` | Authoritative API route registration and middleware ordering. |
| `src/api/system.ts` | Registry-selected stream discovery, remote `files.json` loading, Git tree fallback, caching, and refresh. |
| `src/api/repo-registry.ts` | Registry reads and combined repository/local tree composition. |
| `src/api/raw.ts` | Canonical raw file delivery and path/repository validation. |
| `src/api/auth.ts` / `src/api/oauth.ts` / `src/api/totp.ts` | Email/password identity, OAuth linking, JWT/session behavior, password reset, and TOTP enrollment/verification. |
| `src/lib/permissions.ts` | Bearer authentication, role checks, and TOTP-enrolled write protection. |
| `src/lib/browser-session.ts` / `src/api/session.ts` | Opaque `nb_sid` browser sessions, durable preference persistence, and safe volatile fallback. |
| `src/api/community*.ts` | Community feed, channels, profile presence, moderation, and reports. |
| `src/api/issues.ts` / `src/api/issue-review.ts` / `src/api/pr-review.ts` | Source-linked proposals, review records, approvals, and GitHub PR lifecycle. |
| `src/api/blob.ts` / `src/lib/image-to-svg.ts` | Protected Blob operations and validated biology/chemistry image normalization. |
| `src/db/migrations/*.sql` | Ordered PostgreSQL schema changes for identity, sessions, themes, Community, Issues, and review state. |
| `fmtree.py` / `src/scripts/generate-*.ts` | Local manifest, registry, version, and eager stream artifact generation. |

## Markdown renderer

The renderer is intentionally a two-phase system. `markdownToHTML()` converts Markdown to HTML synchronously, while `initMarkdownFeatures(container)` activates optional MathJax, TikZJax, Mermaid, Desmos, and Highlight.js behavior after the HTML is inserted. If a vendor is unavailable, the reader keeps an explicit fallback instead of failing silently.

### Supported features

| Feature | Syntax or behavior | Notes |
| --- | --- | --- |
| Markdown core | CommonMark-style headings, lists, links, tables, code, blockquotes | `markdown-it` is configured with linkification and typographic helpers. |
| Obsidian links | `[[Page]]`, aliases, heading anchors | Resolved through the current note path and application routes. |
| Embeds | `![[image.svg]]`, sizing variants, audio/video/PDF/note embeds | Relative paths use `window._currentNotePath`. |
| Callouts | `> [!NOTE]`, `> [!TIP]+`, `> [!WARNING]-` | Foldable and accessible callout controls. |
| Math | `$...$`, `$$...$$`, `\(...\)`, `\[...\]` | MathJax renders scientific notation and display equations. |
| Mermaid | ` ```mermaid` | Client-side diagram rendering with selected theme mode and strict security. |
| TikZ | ` ```tikz` | TikZJax path with COOP/COEP support and graceful loading state. |
| Graphing | ` ```desmos`, ` ```desmos3d` | Interactive 2D/3D graphing paths with option parsing. |
| Code | Language-labelled fenced blocks | Highlight.js is loaded on demand; reader controls can wrap long lines. |
| Biology figures | ` ```bio` or ` ```biology` | Safe static figure with `src`, `alt`, `caption`, and `source` keys. |
| Chemistry figures | ` ```chem-setup` or ` ```chemistry` | Same accessible figure contract, with chemistry-specific class metadata. |
| Tasks, tags, highlights | Obsidian-style task states, `#tags`, `==highlight==` | Rendered with accessible labels and application styling. |
| Source evidence | Reader raw view and selection-to-suggest workflow | Source line numbers and file metadata can be carried into an Issues proposal. |

### Biology and chemistry figure convention

Authors should prefer reviewed static assets for recurring scientific structures. A figure fence avoids arbitrary inline HTML while still supporting approachable captions:

````markdown
```bio
src: /assets/diagrams/starter/biological-cell.svg
alt: Labeled cross-section of a biological cell
caption: Major cell structures and their relative locations.
source: /assets/diagrams/starter/ATTRIBUTIONS.md
```

```chem-setup
src: /assets/diagrams/starter/simple-distillation-apparatus.svg
alt: Simple distillation apparatus
caption: Flask, condenser, receiver, and heat source.
```
````

Uploaded images can be normalized through the explicit upload-dialog Biology or Chemistry choice. Native SVGs are sanitized and reported as `mode: vector`. Raster uploads are decoded, near-white pixels are made transparent, and the PNG is placed inside an accessible SVG container reported as `mode: embedded-raster`. This is **not** true vector tracing. A future Potrace/OpenCV worker may add a separately reported vector-trace mode after human-review and provenance checks.

## Backend and data flow

A public stream request follows this path: the server selects repository entries from the generated registry, tries the repository’s `files.json` or Pages manifest, falls back to the GitHub tree API when needed, filters supported content, and returns an eager tree. The browser renders the tree and opens files through the raw delivery path. Generated artifacts and the service worker provide resilience when remote discovery is unavailable.

An authenticated Issue proposal carries the source repository, branch, path, raw URL, selected start/end lines, source text, commit or snapshot metadata, and the user’s explanation. The server validates the request, stores the proposal and review state in PostgreSQL when available, and an authorized reviewer can create or accept the corresponding GitHub PR through the configured GitHub integration. Community posts use a separate moderation and Discussion flow.

Uploaded binary files do not enter PostgreSQL. Admin uploads can commit to the configured GitHub repository; anonymous uploads are staged privately in Vercel Blob and recorded in the review-list metadata until an administrator approves or rejects them. The image conversion endpoint is protected by authentication plus TOTP enrollment and is rate-limited.

### Persistence tiers

| State | Production location | Local fallback |
| --- | --- | --- |
| Users, roles, sessions, themes, Community, Issues, review lifecycle | PostgreSQL/Supabase | Safe volatile fallback for development/tests where explicitly supported. |
| Shared stream cache | Optional KV REST backend plus process cache | Process cache and eager rebuild. |
| Staged binary bytes | Private Vercel Blob | Blob operations fail clearly when the token is absent. |
| Curriculum content | GitHub repositories and Pages manifests | Generated JSON and local `files.json` snapshots. |
| Browser preferences | Opaque `nb_sid` session plus local browser state | Volatile session state when no database exists. |

## Environment variables

The application reads environment variables by capability. Do not commit `.env` files, secret values, raw tokens, private keys, passwords, or session tokens. Names below are the names consumed by the current source; `UPSTASH_REDIS_REST_*` is not the active name for the KV adapter.

### Required for a real production release

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Signs authentication tokens and OAuth state. Use a long random secret. |
| `DATABASE_URL` | PostgreSQL/Supabase connection string for durable identity, sessions, themes, Community, Issues, and review state. |
| `GITHUB_TOKEN` or `GITHUB_PAT` | Server-side GitHub reads/writes where a token is required. Prefer the least-privileged token that supports the configured repositories. |
| `GITHUB_REPO` or registry entries in `GITHUB-REPOSITORIES.md` | Default GitHub target; the registry is authoritative for stream repositories. |
| `GITHUB_BRANCH` | Default branch when a registry entry does not specify one. |
| `BLOB_READ_WRITE_TOKEN` | Required for private Vercel Blob upload, fetch, and delete operations. |
| `APP_URL` | Public canonical origin used in reset links and OAuth callback construction when applicable. |

### Required for specific production capabilities

| Variable | Capability |
| --- | --- |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth linking and user-authorized GitHub flows. |
| `GITHUB_OAUTH_REDIRECT_URI` | Optional explicit OAuth callback; otherwise derived from the request origin. |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID` | GitHub App operations, Discussion/PR automation, and installation-scoped writes. |
| `GITHUB_COMMUNITY_REPO`, `GITHUB_ISSUES_REPO` | Community and Issues repository targets; registry entries remain preferred where configured. |
| `WEBHOOK_SECRET` or `GITHUB_WEBHOOK_SECRET` | HMAC verification for refresh/webhook requests. |
| `RESEND_API_KEY` | Password-reset email delivery. |
| `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY` | reCAPTCHA-protected authentication forms. |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth capability, if enabled. |

### Optional operational variables

`KV_REST_API_URL` and `KV_REST_API_TOKEN` enable shared KV caching/fallback behavior. `USE_SESSION_COOKIE` and `COOKIE_SECURE` control cookie behavior; production cookies should be secure. `ENFORCE_CSRF` enables the configured write-request CSRF checks. `ENABLE_WRITE_LOGS` enables additional write logging. `MAX_OPEN_PRS_PER_ACCOUNT` limits open PRs per account. `DB_POOL_MAX`, `DB_CONNECTION_TIMEOUT_MS`, `DB_IDLE_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`, `DB_SSL`, and `DB_SSL_REJECT_UNAUTHORIZED` tune PostgreSQL connectivity. `REPO_REGISTRY_PATH`, `SUBJECT_REPOS`, `MOUNT_PREFIX`, `APP_BASE_PATH`, `WORKSPACE`, `COMMUNITY_CONTENT_PATH`, `GITPAGE_URL`, and `GITHUB_REPO_BASE` are compatibility or deployment-specific overrides.

## Local development and release commands

Use Node.js 22 or a current supported Node.js release, Python 3 for `fmtree.py`, and npm. The build and test scripts intentionally run without a database by using safe fallbacks; database integration tests require an explicit `RUN_DB_INTEGRATION_TESTS=true` opt-in together with `DATABASE_URL`.

```bash
npm ci
npm run typecheck
npm test
npm run build
npm start
```

For local database validation:

```bash
RUN_DB_INTEGRATION_TESTS=true DATABASE_URL='postgres://…' npm test -- --run tests/database.integration.test.ts
```

For dependency inspection:

```bash
npm run deps:check
npm audit --omit=dev --audit-level=high
```

The build generates `version.json`, `public/json/github-repos.json`, `public/json/repo-registry.json`, and the eager stream tree artifacts. Do not hand-edit those generated files as a substitute for changing the registry or generator.

## v1.0.0 production release gates

A release candidate is not production-ready merely because TypeScript and unit tests pass. Before tagging or switching production traffic, complete the following checks:

1. Confirm that the Vercel project is linked to `fsr-official/NoteBooks-Framework`, uses the intended Node/Express build configuration, and deploys the `whoami` preview successfully before promoting the chosen commit.
2. Configure the production variables listed above in Vercel without printing values in logs. Verify that secrets are present by exercising health/auth capability checks, not by echoing them.
3. Apply and verify the local migration set against a disposable PostgreSQL instance, then reconcile production Supabase migration history with the repository. Do not enable RLS blindly: each table needs intentional policies for the server’s access pattern before RLS is enabled.
4. Complete OAuth linking and TOTP enrollment for the initial administrator, then test protected GitHub, Blob, Community, Issues, and review actions with a staging repository or reversible test data.
5. Verify the Home → stream → Home route transition, Settings theme/read controls, raw view with line numbers, source selection to Issue proposal, anonymous upload review, and native SVG rejection in a production-shaped preview.
6. Run `npm test`, `npm run typecheck`, `npm run build`, `npm audit --omit=dev --audit-level=high`, HTTP smoke checks, and a browser accessibility/performance pass. Record the commit SHA and deployment URL in the release notes.
7. Only after the above passes, tag `v1.0.0` and promote the verified commit. Keep the `whoami` branch as the staging line until production approval is explicit.

## Documentation map

[`docs/phase1/REAL-ARCHITECTURE.md`](docs/phase1/REAL-ARCHITECTURE.md) contains the detailed current architecture map. [`docs/MARKDOWN-RENDERER.md`](docs/MARKDOWN-RENDERER.md) documents renderer behavior and future extensions. [`docs/phase2-3/DIAGRAM-ASSET-AND-RENDERER-PLAN.md`](docs/phase2-3/DIAGRAM-ASSET-AND-RENDERER-PLAN.md) records the image conversion contract and future true-vectorization plan. [`docs/phase2-3/ENVIRONMENT-AND-REMAINING-GAPS.md`](docs/phase2-3/ENVIRONMENT-AND-REMAINING-GAPS.md) records deployment gaps and security follow-up work.

## License and acknowledgements

NoteBooks Framework is maintained as part of the FSR/NoteBooks initiative. Review the repository’s license files and individual asset attribution manifests before redistributing content. The project thanks the maintainers of Markdown-it, MathJax, TikZJax, Mermaid, Highlight.js, Desmos, Sharp, Vercel, Supabase, GitHub, and the open-source authors listed in the asset manifest.

The project specifically acknowledges the Ada source project and **Pratyush Chanda** for the source foundation and help provided within the NoteBooks Project.
