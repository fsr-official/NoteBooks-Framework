# NoteBooks Framework

NoteBooks Framework is the Next.js and Supabase implementation of the NoteBooks study library. It is now the canonical application in this repository, replacing the earlier static framework while retaining the existing repository content conventions.

## Initial direction

NoteBooks Framework v2 will retain the existing GitHub file-system conventions and API routes. The existing `GITHUB-REPOSITORIES.md` registry and `files.json`-based build sequence are considered outdated for larger systems and are planned to be replaced.

The proposed workflow begins with an admin dashboard. Anyone can register with a chosen account ID, email, and password; Supabase Auth handles passwords, and all accounts have a role with only one designated admin. Repository information will be managed in Supabase, including the responsible account ID, repository names, latest commit SHAs, and last-updated dates. Issues and Community repositories are out of scope for now; if they are added later, they should be stored only in Supabase.

The database-backed build and update flow is planned to:

1. Populate a repository file tree from each repository's `files.json`, storing each file's name, relative path, and file SHA.
2. Organize records conceptually as `root -> class/stream -> repo -> files`.
3. On updates, add newly discovered files and compare SHAs for existing files, writing the new SHA when a file changes.
4. Generate the public JSON tree artifacts from the database rather than directly from repository manifests.
5. Make the JSON artifacts reproducible so they can be deleted and regenerated from the authoritative database records.

The repository/file catalog will use one shared table rather than creating a table per repository. It will have a repository anchor row and one linked row per file, with alphabetically ordered fields and stable IDs. The account/role profile is separate from the catalog and Supabase Auth remains the credential store. A proposed schema and repository-list file format are documented in [DATABASE.md](DATABASE.md).

A separate shared repository-list configuration file will specify which repositories and branches to pull. It will follow the role of `GITHUB-REPOSITORIES.md` in NoteBooks-Documents, be editable through the admin dashboard, and be read-only when available on the website. See [DATABASE.md](DATABASE.md) for the proposed filename and format.

The database-generated public indexes contain five section trees and a repository registry:

- `lowersecondary-tree.json` (Class 9 and Class 10)
- `science-tree.json`
- `commerce-tree.json`
- `humanities-tree.json`
- `developer-tree.json`
- `github_repositories.json`

Keyed JSON is also generated as JSONL for streaming/export. Indexes are held in Redis and served from `/api/public/json/` routes with CDN-cacheable response headers, rather than written into the deployment filesystem. This lets browser clients fetch a section's keyed path/SHA mapping without loading all database rows. The existing raw and media API paths will continue to be built and served the same way.

See [DATABASE.md](DATABASE.md) for the shared-table schema, admin and repository-list handling, and GitHub commit detection. Signed GitHub Actions updates are the primary signal, with scheduled commit-SHA reconciliation planned as a recovery path.

## Backend development

The backend uses Next.js App Router route handlers with TypeScript. Use pnpm for dependency management and scripts:

```sh
pnpm install
pnpm dev
```

The initial health endpoint is `GET /api/health`. Supabase's local project configuration is in `supabase/config.toml`, and schema changes belong in `supabase/migrations/`. Copy the variable names from `.env.example` into your local environment file and supply local Supabase credentials there. The service-role key is server-only and must never be exposed to browser code or committed.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` to validate the backend. GitHub Actions runs all four checks for pull requests and pushes to `main`.

The schema and repository-import migrations are applied to the configured remote Supabase project. That project was intentionally reset first; it now contains 11 repository anchors and 839 file rows. Auth users, Storage buckets, and account profiles remain empty. The local Supabase container could not be started in this environment, so local database application remains unverified.

## Accounts and authentication

The website provides `/register`, `/login`, and `/account`, with account links in the main navigation. People can register and sign in with email/password, or use GitHub OAuth. GitHub linking is optional: signed-in users can connect it later from `/account`, while email/password remains available. OAuth-only users receive a generated `user-…` account ID; email registration asks for a unique account ID.

Apply `supabase/migrations/20261115003000_allow_oauth_account_creation.sql` before accepting GitHub signups. It lets the auth trigger assign a safe generated account ID when the OAuth provider supplies no NoteBooks account metadata. The local Supabase configuration enables manual identity linking and allows localhost callback URLs.

For hosted Supabase, enable the GitHub provider in **Authentication → Providers**, set its Client ID and Client Secret as Supabase secrets, and add `https://<project-ref>.supabase.co/auth/v1/callback` to the GitHub OAuth app's callback URLs. Add `https://<your-site>/auth/callback` to Supabase's allowed redirect URLs and enable manual identity linking in the Auth provider settings. Never expose the GitHub Client Secret to the browser or commit it.

The Supabase OAuth Server consent path is `/oauth/consent`. It authenticates users first, then uses Supabase's OAuth Server SDK methods to show the requesting client's name, requested scopes, and redirect destination before approving or denying the request. Set the same path under **Authentication → OAuth Server → Authorization Path**. Ensure the Site URL has no trailing slash so the preview URL is `https://<your-site>/oauth/consent`, not a double-slash URL. For local Supabase, OAuth Server is enabled in `supabase/config.toml`; dynamic client registration remains disabled unless you explicitly enable it.

Repository import is available through `pnpm repos:sync` (read-only preview) and `pnpm repos:sync:apply` (write). Use `pnpm exec tsx scripts/import-repositories.ts --repo owner/repository` to preview one configured repository, or add `--apply` to sync just that repository and rebuild its section index. Rebuild all six public indexes from the current database without fetching repositories again using `pnpm indexes:rebuild`, and verify their Redis contents with `pnpm redis:verify`. Both database and Redis server credentials must be configured. See [DATABASE.md](DATABASE.md) and [Redis operations](redis/README.md) for details.

After applying `supabase/migrations/20261114120000_merge_class_libraries.sql`, run `pnpm indexes:rebuild` to publish the combined Lower Secondary index from the migrated catalog.

## Content API

The `/api/v1/keys` endpoints issue account-owned API keys after Supabase Auth signup; `GET /api/v1/files` uses those keys to download catalogued Markdown with per-key rate limiting and SHA-verified Redis caching. See [API documentation](api/README.md) and the [OpenAPI contract](api/openapi.yaml). Apply the new API-key migration before enabling these endpoints.

## Browser experience

The Next.js frontend provides a responsive home page and five indexed libraries (`/lowersecondary`, `/science`, `/commerce`, `/humanities`, and `/developers`). Class 9 and Class 10 share the Lower Secondary index; the old `/classnine` and `/classten` routes remain aliases. The library browser follows the indexed repository and relative folder hierarchy, with repository selection, folder breadcrumbs, and file type badges (`CN`, `GL`, and `NT` for CNOTES, GLOSSARY, and NOTES). Search preserves that folder structure, and selected files link to their source on GitHub. Double-click a file to open the reading view; image, audio, video, and PDF files also open in the viewer.

Each browser gets a random client session ID and a stable, session-derived display name shown in the left rail. The ID, selected theme and colors, and last selected file are stored locally in that browser and restored on later visits. This is a local preference identifier, not an authenticated account or security credential. Theme presets and light/dark mode are available on the home page and in the navigation.

The reader shell is Next.js, while the existing browser-side renderer converts Markdown and initializes DOM-based features: MathJax, Mermaid, TikZJax, syntax highlighting, Desmos graphing/3D, Obsidian callouts, embeds, frontmatter, and Markdown-it extensions. The runtime and expensive diagram libraries load lazily. The reading view includes raw Markdown, a heading outline, speech controls, reader styling, and same-origin media delivery. `GET /api/raw` and `GET /api/media` (also available at the legacy `.js` aliases) resolve only catalogued repository paths through the public Redis indexes and verify fetched Git blob SHAs. PDFs use a lazily loaded PDF.js reader with page navigation, zoom, virtualized lazy thumbnails, selectable text, document search, and download controls. The page spread defaults to two pages on desktop and one on mobile, with an explicit layout toggle; left/right arrow keys animate backward and forward navigation. Normal, browser-window, and browser-fullscreen display modes are available. The PDF.js worker, CMaps, and standard fonts are served locally from `public/js`. PDF responses support `HEAD` and byte ranges, and Git LFS media ranges are forwarded upstream. Rendered HTML is sanitized with DOMPurify before being mounted.

The production app registers a v2 service worker for static assets and previously visited public pages. It deliberately bypasses API, authentication, Next.js runtime, and byte-range requests; offline mode is best-effort and does not make the live catalog or reader APIs available without a connection. The app icon is based on the original project's favicon. The renderer bundle is GPL-3.0-or-later; see [LICENSE](LICENSE). PDF.js is distributed under Apache-2.0; see [public/js/pdfjs-LICENSE](public/js/pdfjs-LICENSE). In Next.js, files in `public/js`, `public/bin`, and `public/fonts` are served from `/js`, `/bin`, and `/fonts` respectively.

## Repository update workflows

`share/` is a portable bundle for the content repositories; these templates are not workflows for the v2 backend repo. Copy `share/fmtree.py` to the content repository root as `fmtree.py`, and copy `share/.github/workflows/fmupdate.yaml` plus `fmwebhook.yaml` into that repository's `.github/workflows/` directory. GitHub only discovers workflows in `.github/workflows/`. `fmupdate.yaml` regenerates `files.json` on pushes, then calls `fmwebhook.yaml`, which notifies `POST /api/webhooks/repository-update`. The endpoint verifies an HMAC signature, refreshes the matching enabled repository from GitHub, and selectively rebuilds its section's public indexes in Redis.

Configure `WEBSITE_URL` as the full webhook endpoint URL and `WEBHOOK_SECRET` as GitHub Actions secrets in each content repository. The website must use the same `WEBHOOK_SECRET` in its server environment. Keep the secret out of source control; `.env.example` contains only a placeholder. If called from another workflow, grant `contents: write` so `fmupdate.yaml` can commit the regenerated manifest.

## Project status

The Next.js TypeScript backend foundation, initial repository importer, signed GitHub-to-QStash update path, selective public-index generator, account API routes, email/password and GitHub sign-in UI, browser library, Markdown/media reading view, and initial PWA assets are in place for the initial rollout. Configure and verify the deployment environment, Supabase Auth and migrations, Redis, and webhook secrets before opening the service to users. The admin dashboard and repository-list editing flow, scheduled SHA reconciliation, end-to-end remote webhook verification, and further backup/recovery hardening remain on the implementation plan in [PLAN.md](PLAN.md).