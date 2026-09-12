> **Document status:** historical implementation record. For current behavior, use [`docs/README.md`](../../README.md), the root [`README.md`](../../../README.md), and the active architecture/release documents.
>
# Environment Variables and Remaining Application Gaps

## Environment variables

The current application uses direct PostgreSQL through `pg`; it does **not** require `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`. Supabase is the hosted database provider, while `DATABASE_URL` is the server connection boundary.

### Minimum production configuration

| Variable | Required for | Notes |
|---|---|---|
| `NODE_ENV=production` | Production behavior | Prevents runtime remote artifact generation and enables production defaults. |
| `JWT_SECRET` | Authentication and authorization | Use a long random secret; rotate the previously provisioned account password separately. |
| `DATABASE_URL` | Durable identity, roles, profiles, presence, Community, Issues, moderation, reviews, and PR lifecycle | Use the Supabase PostgreSQL transaction-pooler connection string appropriate for Vercel/serverless traffic. |
| `GITHUB-REPOSITORIES.md` / generated artifact | Community, Issues, and content repository routing | Canonical repository-name source; generated at build time as `public/json/github-repos.json`. |
| `GITHUB_REPO` | Legacy/default GitHub routes and fallback behavior | Generated repository artifacts are canonical for stream selection, but this remains used by compatibility paths. |
| `GITHUB_BRANCH` | Default branch fallback | Defaults to `main`; set explicitly if the primary repository uses another branch. |
| `APP_URL` | Password-reset/email links and OAuth URL consistency | Use the deployed HTTPS origin. OAuth can derive an origin in some flows, but an explicit value is safer. |

### Required for the protected administrator-to-GitHub workflow

The admin review boundary needs all of the following categories configured and verified together:

| Category | Variables | Purpose |
|---|---|---|
| Database and app identity | `DATABASE_URL`, `JWT_SECRET` | Resolve the same internal user, roles, review state, TOTP enrollment, and lifecycle records. |
| GitHub OAuth | `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, optionally `GITHUB_OAUTH_REDIRECT_URI` | Link the administrator’s GitHub identity. The redirect URI must match the GitHub OAuth application. |
| GitHub write access | Either `GITHUB_TOKEN` or `GITHUB_PAT`, **or** `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_APP_INSTALLATION_ID` | Read current source, create branches, write replacement content, and open the PR. Prefer a narrowly scoped GitHub App or fine-grained token. |
| Administrator security | Stored GitHub linkage and enrolled TOTP | These are database/account state, not environment variables, and are required by `requireAdminSecurity`. |

Do not configure both a broad PAT and an App unless there is a deliberate fallback policy. Never expose either credential to browser code.

### Recommended security and session settings

| Variable | Recommended value | Effect |
|---|---:|---|
| `ENFORCE_CSRF` | `true` | Enables double-submit CSRF checks for cookie-authenticated state-changing requests. |
| `USE_SESSION_COOKIE` | `true` only if cookie sessions are the chosen session model | Enables the HttpOnly `session` cookie path. |
| `COOKIE_SECURE` | `true` in HTTPS production | Marks the session cookie Secure. |
| `RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET_KEY` | Set together if bot protection is desired | The browser key is exposed through public config; the secret remains server-only. |
| `DB_SSL` | `true` or the deployment’s explicit SSL mode | Enables PostgreSQL SSL handling. |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` | Preserve certificate verification. |

### Optional integrations and tuning

| Variables | Use |
|---|---|
| `RESEND_API_KEY` | Password reset and transactional email delivery. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Shared Redis-compatible cache/cooldown behavior. The code reads these `KV_*` names; the README’s older `UPSTASH_REDIS_REST_*` names do not match the current implementation. |
| `BLOB_READ_WRITE_TOKEN` | Blob upload integration. |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Optional Google OAuth path. |
| `GITHUB_WEBHOOK_SECRET` | GitHub App webhook signature verification. |
| `WEBHOOK_SECRET` | Refresh-signal webhook verification fallback. |
| `DESMOS_API_KEY` | Desmos graphing endpoint. |
| `COMMUNITY_CONTENT_PATH`, `GITHUB_REPO_BASE` | Community content and branch routing overrides. |
| `GITHUB_APP_AUTO_PR` | Set `true` only if approved community posts should automatically create PRs. |
| `GITHUB_APP_AUTO_MERGE`, `GITHUB_APP_AUTO_MERGE_METHOD` | Set only after staged validation; supports merge/squash/rebase behavior. |
| `MAX_OPEN_PRS_PER_ACCOUNT` | Per-account open-PR limit; defaults to 3. |
| `DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS`, `DB_CONNECTION_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS` | PostgreSQL pool and query tuning; bounded defaults already exist. |
| `ENABLE_WRITE_LOGS` | Development/controlled diagnostics for state-changing requests. Avoid logging sensitive request bodies. |
| `PORT` | Local Node server port; defaults to 4000. |
| `VERCEL` | Set by Vercel; used to enforce production artifact behavior. |
| `REPO_REGISTRY_PATH`, `MOUNT_PREFIX`, `APP_BASE_PATH`, `SUBJECT_REPOS`, `WORKSPACE` | Compatibility or deployment-specific overrides. The generated `github-repos.json` artifact now supersedes routine Markdown parsing. |

## Remaining gaps after the completed passes

### Production activation blockers

The Vercel runtime still needs its server-side `DATABASE_URL`. Without it, the public shell can render, but durable identity, roles, presence, Community writes, Issue proposals, moderation records, reviewer decisions, and PR lifecycle state cannot be exercised end to end. The already-applied Supabase migrations do not automatically configure the deployed application.

The initial Super Admin also needs a real production activation pass: link the GitHub identity through OAuth, enroll and verify TOTP through the mounted `/api/totp` flow, validate the role assignments, and rotate the previously provisioned password. The protected flow must then be tested against a staging proposal before allowing real PR creation.

### High-priority security work

The application still has a permissive legacy CSP with `'unsafe-inline'`, inline script attributes, `blob:`, and multiple third-party origins. It should be migrated toward nonce/hash-based scripts and a narrower allowlist. Mermaid now uses `securityLevel: 'strict'`; repository and user-controlled Markdown remain an explicit trust boundary. The remaining CSP work is independent of this Mermaid hardening.

Rate limiting covers authentication, Blob/file operations, and legacy PR submission, but it is not yet standardized across Community messages, reports, Issue proposals, comments, votes, moderation, reviewer decisions, and PR attempts. The global 25 MiB JSON body limit should also become route-specific. The production dependency audit is now clean; `undici` is pinned to the compatible 6.28.x patch through `package.json` overrides. Full development-tree audits should continue in CI without using force fixes.

Legacy compatibility routes remain broader than the new canonical review boundary. In particular, the legacy `GET /api/pr-review` registration and subject-named compatibility routes should be reviewed, documented, and either protected consistently or retired after an explicit compatibility decision.

### Stability and product-completeness work

The homepage is now locally healthy, but production edge behavior has not been measured. The local final Lighthouse run reached 0.89 performance with 2.6-second FCP, 3.2-second LCP, 3.2-second TTI, zero blocking time in that run, and 298 KiB total transfer. Vercel CDN behavior, cold starts, serverless concurrency, cache invalidation, and real external CDN timing still need production-shaped testing.

Community channels currently use request/response polling rather than realtime transport. Public Issue/Community surfaces do not yet expose the full reviewer-comment context that the admin UI can read. Cross-device theme persistence, activity feeds, unread state, and moderation behavior require database-backed authenticated smoke tests rather than only zero-state local tests.

The Commerce repository intentionally has no content files and its raw root `files.json` endpoint returns `404`. The registry now marks it `empty=true`, so build-time and runtime generation produce a valid empty Commerce tree without a stale fallback or repeated remote requests. If Commerce content is added later, remove the flag and restore the manifest path. The Home → Science → Home client transition is now locally verified; production edge and service-worker rollout behavior still need deployment-shaped smoke testing.

### Explicitly deferred by product decision

PDF repository storage through server-side `GITHUB_PAT`, OCR for PDFs without usable text, OCR-PDF persistence, volunteer work distribution, and external Claude AI-NoteGen automation remain deferred. They are not missing regressions in the current milestone; they are future architecture work.
