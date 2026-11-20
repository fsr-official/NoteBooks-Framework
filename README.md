# NoteBooks Framework

NoteBooks Framework is the Next.js and Supabase implementation of the NoteBooks study library. It is now the canonical application in this repository, replacing the earlier static framework while retaining the existing repository content conventions.

## Initial direction

NoteBooks Framework v2 will retain the existing GitHub file-system conventions and API routes. The existing `GITHUB-REPOSITORIES.md` registry and `files.json`-based build sequence are considered outdated for larger systems and are planned to be replaced.

The application uses a protected admin dashboard to manage a Supabase-backed repository catalog. Supabase Auth handles account credentials, and the database permits only one designated admin. Repository records include their responsible account ID, latest commit SHA, and check/update timestamps. Issues and Community repositories are out of scope for now; if they are added later, they should be stored only in Supabase.

The Developers stream is available from the native site navigation at `/developers`. Its tree is generated from the same Supabase catalog as the subject streams and includes architecture, public policies, renderer test subjects, and parser research from `fsr-official/NoteBooks-Developers`. The production renderer supports Markdown/KaTeX and Desmos 2D/3D; MDX remains a research proposal and is not executed in production.

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

The website provides `/register`, `/login`, and an anonymous study dashboard at `/account`, with account links in the main navigation. People can register and sign in with email/password, GitHub, or Discord. Signed-in account settings and optional GitHub/Discord linking are available at `/account/settings`. Each account has a permanent, unique User ID and a separate editable, non-unique User Name. GitHub OAuth suggests the GitHub username as the User ID and User Name; the User ID can be changed before setup is saved, but not afterward. Users can optionally set an email/password credential or continue using a connected OAuth provider.

Apply `supabase/migrations/20261115003000_allow_oauth_account_creation.sql` before accepting GitHub signups. It lets the auth trigger assign a safe generated account ID when the OAuth provider supplies no NoteBooks account metadata. The local Supabase configuration enables manual identity linking and allows localhost callback URLs.

Apply `supabase/migrations/20261117090000_account_identity_and_sessions.sql` before using the updated OAuth flow. It stores the verified GitHub identity, binds the browser session to the authenticated user, and prevents changing a chosen User ID after initial OAuth setup. GitHub’s username is suggested as the User ID; users can edit the suggestion before saving it. The browser’s signed-in display is updated only after the server verifies the Supabase access token.

For hosted Supabase, enable the GitHub provider in **Authentication → Providers**, set its Client ID and Client Secret as Supabase secrets, and add `https://<project-ref>.supabase.co/auth/v1/callback` to the GitHub OAuth app's callback URLs. Add `https://<your-site>/auth/callback` to Supabase's allowed redirect URLs and enable manual identity linking in the Auth provider settings. Never expose the GitHub Client Secret to the browser or commit it.

Discord sign-in and linking use the same `/auth/callback` and manual-linking flow. For hosted Supabase, enable Discord in **Authentication → Providers**, keep its Client ID and Client Secret in Supabase's provider settings, and register `https://<project-ref>.supabase.co/auth/v1/callback` in the Discord application. Locally, `supabase/config.toml` keeps Discord disabled by default; to test it, provide `SUPABASE_AUTH_EXTERNAL_DISCORD_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_DISCORD_SECRET` in the local environment and enable that provider in the local config. Do not put either value in a `NEXT_PUBLIC_*` variable.

### Signup and Auth email delivery

Email/password signup sends a confirmation message to the address entered in `/register` when email confirmation is enabled. Users enter the eight-digit code in the registration page; the app verifies it through Supabase Auth. Supabase enforces the configured minimum password length and strength requirements on Auth requests; the registration form also requires at least eight characters. Supabase's built-in SMTP is for development only: it can deliver only to project-team addresses and is limited to 2 messages per hour. For production delivery to arbitrary users, configure a custom SMTP provider. No application-level mail API key or Vercel variable is needed; Supabase Auth sends these messages.

Email signup, password login, signup-code resend, password-reset requests, and email-address changes are protected by Cloudflare Turnstile. The widget is tagged with a distinct action for each flow. Supabase Auth validates signup, login, resend, and password-reset tokens when CAPTCHA protection is enabled. Enable it in **Authentication → Bot and Abuse Protection → CAPTCHA Protection**, select **Turnstile**, and enter the production widget secret. Email changes first verify the `email-change` action and a hostname matching `APP_BASE_URL` on the app server, then use Supabase's SDK to preserve its PKCE email-confirmation flow. Upstash sliding-window limits also apply to app-driven signup, login, OTP verification/resend, password-reset, and email-change requests; production rate limiting requires the existing `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Set the public site key as `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in Vercel and the server-only secret as `TURNSTILE_SECRET_KEY` in Vercel. Never expose the secret. Google reCAPTCHA keys are not used by this integration.

For localhost Turnstile tests, `.env.development.local` uses Cloudflare's documented always-pass test sitekey and secret; `supabase/config.toml` enables Turnstile with the same test secret for local Auth. These dummy keys work on localhost and return `example.com` without an action, which the email-change verifier accepts only when both exact test keys are configured outside production. Production rejects all documented test secrets. After changing local Supabase config, restart the local Supabase stack. Do not copy test keys to Vercel; continue using the real production widget there. See [Cloudflare's testing guide](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

### AI chat

The reader chat uses Groq's `openai/gpt-oss-120b` model, including its optional built-in browser search. Five server-only Groq keys are rotated evenly by request count (`GROQ_API_KEY_MAIN`, `GROQ_API_KEY_SCIENCE`, `GROQ_API_KEY_COMMERCE`, `GROQ_API_KEY_HUMANITIES`, and `GROQ_API_KEY_LOWER_SECONDARY`). Rotation balances requests across configured keys; it does not increase Groq's organization-level rate limits. Provider rate limits put the affected slot into a bounded cooldown and the request can fall back to another enabled slot.

Chat history is stored per note in the current browser and can only be cleared from Account settings. Before the first request, users must accept the [AI Usage Policy](/ai-usage-policy) and [Privacy Policy](/privacy). A request sends the question, up to six recent messages, and a bounded set of relevant note excerpts (or text the user explicitly selected) to Groq. Browser search is opt-in from the chat action menu. Anonymous visitors are limited by both hashed IP and a random browser ID; signed-in users have an account-based allowance. Upstash rate limits protect AI requests; AI chat does not use Cloudflare Turnstile. Defaults are 6 requests per 15 minutes / 20 per day per anonymous IP, plus 10 per 15 minutes / 35 per day per anonymous browser; signed-in accounts receive 12 per 15 minutes / 60 per day. The chat warns when three or fewer requests remain in the current allowance. Signed-in prompt and completion tokens and request totals are shown in Account settings. Only usage metadata is stored; prompts and chat history are not stored on the server.

Set the `GROQ_API_KEY_*` variables in the server's environment, never in `NEXT_PUBLIC_*` variables. The private admin console shows per-slot aggregate requests, token totals, and observed cooldown state, and lets an administrator disable or re-enable a configured slot without exposing its secret. Aggregate metrics are retained in minute buckets for 30 days; account-level usage remains limited to signed-in users. Apply `supabase/migrations/20261118200000_ai_usage_tracking.sql` and `supabase/migrations/20261119120000_ai_provider_key_admin.sql` before enabling AI chat in production. Keep the existing Upstash and Supabase service-role settings configured.

Recommended setup with Resend when you have a verified sending domain:

1. Add a sending domain or subdomain you control in Resend, publish its requested DNS records, and wait until Resend marks it verified. Choose a sender address on that verified domain, such as `no-reply@mail.example.com`.
2. Create a Resend API key with permission to send from that domain. Keep it private; do not commit it, put it in `.env.production`, or send it in chat.
3. In the Supabase project, open **Authentication → Email → SMTP Settings**, enable custom SMTP, and set:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the Resend API key
   - Sender email: the address on your verified domain
   - Sender name: `NoteBooks`
4. On the Supabase **Authentication → Emails → Templates → Confirm signup** page, set the subject to `Confirm your NoteBooks account` and the body to:
   ```html
   <h2>Confirm your NoteBooks account</h2>
   <p>Enter this eight-digit code to verify your email address:</p>
   <p style="font-size: 24px; font-weight: 700; letter-spacing: 0.16em;">{{ .Token }}</p>
   <p>If you did not create a NoteBooks account, you can ignore this email.</p>
   ```
   The same template is kept locally in [supabase/templates/confirmation.html](supabase/templates/confirmation.html).
5. In **Authentication → Providers → Email**, make sure email signup is enabled and **Confirm email** is enabled. Save the settings.
6. Register with an inbox you can access. Confirm the email arrives, enter its eight-digit code in the registration form, and verify that the account is signed in. Use Supabase Auth logs and Resend email logs to diagnose delivery failures.

Do not enable email auto-confirmation as a workaround for missing email delivery. Local Supabase email is captured by its local email testing server rather than sent to a real inbox. `supabase/config.toml` enables local email confirmation and loads the checked-in OTP template; hosted project settings must be configured separately in the Supabase dashboard.

For low-volume testing without a domain, Gmail SMTP may be used instead. Enable 2-Step Verification on the Gmail account and create a Google App Password. In Supabase SMTP Settings, use `smtp.gmail.com`, port `465` (SSL) or `587` (STARTTLS), the full Gmail address as the SMTP username, and the App Password as the SMTP password. Set the sender email to that same Gmail address. This is a small-project/testing option and remains subject to Gmail sending limits; never use the regular Google account password.

The Supabase OAuth Server consent path is `/oauth/consent`. It authenticates users first, then uses Supabase's OAuth Server SDK methods to show the requesting client's name, requested scopes, and redirect destination before approving or denying the request. Set the same path under **Authentication → OAuth Server → Authorization Path**. Ensure the Site URL has no trailing slash so the preview URL is `https://<your-site>/oauth/consent`, not a double-slash URL. For local Supabase, OAuth Server is enabled in `supabase/config.toml`; dynamic client registration remains disabled unless you explicitly enable it.

Repository import is available through `pnpm repos:sync` (read-only preview) and `pnpm repos:sync:apply` (write). Use `pnpm exec tsx scripts/import-repositories.ts --repo owner/repository` to preview one configured repository, or add `--apply` to sync just that repository and rebuild its section index. Rebuild all six public indexes from the current database without fetching repositories again using `pnpm indexes:rebuild`, and verify their Redis contents with `pnpm redis:verify`. Both database and Redis server credentials must be configured. See [DATABASE.md](DATABASE.md) and [Redis operations](redis/README.md) for details.

After applying `supabase/migrations/20261114120000_merge_class_libraries.sql`, run `pnpm indexes:rebuild` to publish the combined Lower Secondary index from the migrated catalog.

## Admin dashboard

The private operations console is available at `/admin`. It can add, edit, disable, archive/restore, and assign repository records; queue a check of one or all enabled repositories; rebuild the public indexes; and inspect catalog health, recent API traffic/error/latency and library page-view metrics, configured service dependencies, recent repository check outcomes, and admin actions. Repository checks are queued through QStash and run by the signed worker; a queued response means work was accepted, not that it has completed.

To establish the first administrator:

1. Apply `supabase/migrations/20261116100000_admin_dashboard.sql` after the existing migrations.
2. Configure the production environment from `.env.example`, including `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `QSTASH_TOKEN`, both QStash signing keys, `GITHUB_TOKEN`, and `APP_BASE_URL`.
3. Generate a strong, one-time `ADMIN_BOOTSTRAP_TOKEN` (at least 32 random bytes) and set it only as a server environment variable. Do not commit it or put it in a public/client variable.
4. Register or sign in with the account you want to make the administrator, then open `/admin` and submit the bootstrap token.
5. Remove `ADMIN_BOOTSTRAP_TOKEN` from the deployment environment after the claim succeeds, then redeploy.

The bootstrap endpoint promotes only the signed-in account and only while no administrator exists. A database uniqueness constraint also enforces the single-admin rule. The account itself must be created through Supabase Auth; the application does not create or expose an administrator password.

API metrics and public-library page views are aggregated into one-minute buckets and begin accumulating after the admin dashboard migration is applied. They contain route counts and durations only—not query strings, request bodies, authorization headers, IP addresses, visitor IDs, or response contents. Repository check history records outcome, duration, changed commit, and file count without persisting raw upstream error text. The activity panel is an application audit trail, not a copy of Vercel's runtime logs; use the linked Vercel dashboard for detailed deployment/runtime logs. GitHub and QStash health indicators report whether their server credentials are configured, not whether those upstream services are currently reachable.

## Content API

The `/api/v1/keys` endpoints issue account-owned API keys after Supabase Auth signup; `GET /api/v1/files` uses those keys to download catalogued Markdown with per-key rate limiting and SHA-verified Redis caching. See [API documentation](api/README.md) and the [OpenAPI contract](api/openapi.yaml). Apply the new API-key migration before enabling these endpoints.

## Browser experience

The Next.js frontend provides a responsive home page and five indexed libraries (`/lowersecondary`, `/science`, `/commerce`, `/humanities`, and `/developers`). Class 9 and Class 10 share the Lower Secondary index; the old `/classnine` and `/classten` routes remain aliases. The library browser follows the indexed repository and relative folder hierarchy, with repository selection, folder breadcrumbs, and file type badges (`CN`, `GL`, and `NT` for CNOTES, GLOSSARY, and NOTES). Search preserves that folder structure, and selected files link to their source on GitHub. Double-click a file to open the reading view; image, audio, video, and PDF files also open in the viewer.

Each browser gets a random client session ID and an anonymous, session-derived User Name shown in the left rail. After sign-in, the browser session is bound server-side to the verified account, and the dashboard displays the permanent User ID and editable User Name. Recent file history and themes remain local to the browser; history can be cleared and files are never automatically reopened when entering a stream. Anonymous User Names and session IDs are local display/session data, not authenticated credentials. Theme presets and light/dark mode are available on the home page and in the navigation.

The reader shell is Next.js, while the existing browser-side renderer converts Markdown and initializes DOM-based features: MathJax, Mermaid, TikZJax, syntax highlighting, Desmos graphing/3D, Obsidian callouts, embeds, frontmatter, and Markdown-it extensions. The runtime and expensive diagram libraries load lazily. The reading view includes raw Markdown, a heading outline, speech controls, reader styling, and same-origin media delivery. `GET /api/raw` and `GET /api/media` (also available at the legacy `.js` aliases) resolve only catalogued repository paths through the public Redis indexes and verify fetched Git blob SHAs. PDFs use a lazily loaded PDF.js reader with page navigation, zoom, virtualized lazy thumbnails, selectable text, document search, download controls, and the NoteBooks AI Assistant. The initial page spread defaults to two pages on desktop and one on mobile; the selected layout is saved per PDF, single-page mode stays single across window/fullscreen changes, and two-page mode falls back to one page only when the viewport is narrow. Left/right arrow keys animate backward and forward navigation. Normal, browser-window, and browser-fullscreen display modes are available, with the AI Assistant available in each. The PDF.js worker, CMaps, and standard fonts are served locally from `public/js`. PDF responses support `HEAD` and byte ranges, and Git LFS media ranges are forwarded upstream. Rendered HTML is sanitized with DOMPurify before being mounted.

Vercel Speed Insights is included in the root layout for Vercel deployments. Enable **Speed Insights** for the project in the Vercel dashboard to collect real-user performance data; the integration is omitted from non-Vercel builds.

The production app registers a v2 service worker for static assets and previously visited public pages. It deliberately bypasses API, authentication, Next.js runtime, and byte-range requests; offline mode is best-effort and does not make the live catalog or reader APIs available without a connection. The app icon is based on the original project's favicon. The renderer bundle is GPL-3.0-or-later; see [LICENSE](LICENSE). PDF.js is distributed under Apache-2.0; see [public/js/pdfjs-LICENSE](public/js/pdfjs-LICENSE). In Next.js, files in `public/js`, `public/bin`, and `public/fonts` are served from `/js`, `/bin`, and `/fonts` respectively.

## Repository update workflows

`share/` is a portable bundle for the content repositories; these templates are not workflows for the v2 backend repo. Copy `share/fmtree.py` to the content repository root as `fmtree.py`, and copy `share/.github/workflows/fmupdate.yaml` plus `fmwebhook.yaml` into that repository's `.github/workflows/` directory. GitHub only discovers workflows in `.github/workflows/`. `fmupdate.yaml` regenerates `files.json` on pushes, then calls `fmwebhook.yaml`, which notifies `POST /api/webhooks/repository-update`. The endpoint verifies an HMAC signature, refreshes the matching enabled repository from GitHub, and selectively rebuilds its section's public indexes in Redis.

Configure `WEBSITE_URL` as the full webhook endpoint URL and `WEBHOOK_SECRET` as GitHub Actions secrets in each content repository. The website must use the same `WEBHOOK_SECRET` in its server environment. Keep the secret out of source control; `.env.example` contains only a placeholder. If called from another workflow, grant `contents: write` so `fmupdate.yaml` can commit the regenerated manifest.

The backend repository also runs a daily reconciliation at 03:17 UTC through `.github/workflows/repository-reconciliation.yml`. It queues checks for every enabled, non-archived catalog repository; the existing worker compares the current branch SHA with the stored SHA and updates the catalog only when content changed. Set `APP_BASE_URL` and a separate, random `REPOSITORY_RECONCILIATION_SECRET` (at least 32 bytes) as GitHub Actions secrets, and set that same reconciliation secret as a server-only deployment environment variable. Do not reuse `WEBHOOK_SECRET` or expose either value in client configuration. The workflow can also be started manually from the Actions tab on `main`. A successful workflow means the checks were queued, not completed; inspect repository-check results in `/admin`.

## Project status

The Next.js TypeScript backend, repository importer, signed GitHub-to-QStash update path, daily scheduled SHA reconciliation, selective public-index generator, account API routes, email/password and GitHub sign-in UI, browser library, Markdown/media reading view, PWA assets, and initial admin operations console are in place. Configure and verify the deployment environment, Supabase Auth and migrations, Redis, and webhook/reconciliation secrets before opening the service to users. Editing the shared `GITHUB-REPOSITORIES.md` configuration through the dashboard, end-to-end remote webhook and reconciliation verification, and further backup/recovery hardening remain on the implementation plan in [PLAN.md](PLAN.md).