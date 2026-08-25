# Production Configuration and Future Scope

**Status:** Active reference for the `whoami` release candidate
**Author:** Manus AI
**Updated:** 25 August 2026

## Purpose

This document is the operational boundary for NoteBooks Framework’s production configuration. It explains which Vercel variables the current Express application reads, which provider-managed variables may exist without being application inputs, which optional capabilities are not required for the current release, and which future features must not be represented as complete until their implementation and security tests exist.

> **Important:** A variable being visible in Vercel does not prove that the current NoteBooks server reads it. The application contract is defined by the code under `src/`, not by the names produced automatically by a storage integration.

## Current target topology

The intended production topology is one Supabase project, one Vercel project linked to the correct GitHub repository, and a separate private Blob store for upload/review material.

| Layer | Current target | Responsibility |
|---|---|---|
| Source repository | `fsr-official/NoteBooks-Framework` | Application source, registry, static client, migrations, workflows, and release history. |
| Release branch | `whoami` for Preview; `main` for Production | Preview and production source selection. |
| Supabase | `NoteBooks-Project`, ref `xnncmzrxzzzylkxunpux` | PostgreSQL persistence for identity, sessions, themes, Community, Issues, reviews, and audit records. |
| Vercel | Project named `notebooks-framework` in the user’s current dashboard | Serverless Express function, static assets, generated manifests, and deployment environments. Verify its Git link before release. |
| Blob | Private Vercel Blob store connected to the correct Vercel project | Uploaded source files, waiting-list material, and normalized SVG derivatives. |

The old `notebooks-framework` database entry in the Vercel storage chooser must not be reconnected. The Supabase `NoteBooks-Project` connection is the source of truth for application PostgreSQL.

## Vercel environment contract

### Required for the current core

| Variable | Required | Source or value rule | Server/client boundary |
|---|---:|---|---|
| `DATABASE_URL` | Yes for database persistence | Copy the URI from Supabase **Connect** for `NoteBooks-Project`. Use a pooler URI appropriate for Vercel. | Server-only; sensitive. |
| `DB_SSL` | Recommended | Set to `require`. This is an application setting, not a provider credential. | Server-only. |
| `JWT_SECRET` | Yes | Generate a long random value independently for Preview and Production. | Server-only; sensitive. |
| `GITHUB_PAT` or `GITHUB_TOKEN` | Required for legacy GitHub write paths | Use a least-privilege token scoped to the required repositories. | Server-only; sensitive. |
| `GITHUB_REPO` | Conditional | Default repository fallback. Registry entries take precedence for configured streams/workspaces. | Server-only configuration. |
| `GITHUB_BRANCH` | Yes | `whoami` in Preview; `main` in Production. Configure environment-specific values. | Server-only configuration. |
| `APP_URL` | Yes for auth links | The canonical URL of the current environment. | Server-derived; not a secret. |
| `BLOB_READ_WRITE_TOKEN` | Required for Blob upload path | Generated when a private Blob store is connected. | Server-only; sensitive. |

Supabase provides direct, session-pooler, and transaction-pooler connection modes. Its documentation recommends pooler modes for application traffic in serverless environments; the transaction pooler uses port `6543` and does not support prepared statements, so switch to session pooling if the current Node `pg` runtime reports prepared-statement errors.[1]

Vercel Blob can use a long-lived `BLOB_READ_WRITE_TOKEN`, or Vercel’s OIDC variables when the project and SDK path are configured for OIDC. The current NoteBooks server explicitly reads `BLOB_READ_WRITE_TOKEN`, so keep that variable until the code is intentionally migrated to the OIDC path.[2]

### Optional features

| Variable | Feature | Current status |
|---|---|---|
| `GITHUB_COMMUNITY_REPO` | Community write fallback | Optional; registry routing remains authoritative. Recommended value: `fsr-official/NoteBooks-Community`. |
| `GITHUB_ISSUES_REPO` | Issues write fallback | Optional; registry routing remains authoritative. Recommended value: `fsr-official/NoteBooks-Issues`. |
| `GITHUB_APP_ID` | GitHub App authentication | Not required until App-based PR automation is enabled. |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App authentication | Not required until App-based PR automation is enabled; always server-only. |
| `GITHUB_APP_INSTALLATION_ID` | GitHub App repository installation | Not required until the App is installed on the target repositories. |
| `WEBHOOK_SECRET` or `GITHUB_WEBHOOK_SECRET` | Signed webhook verification | Not required until the webhook endpoint is enabled; choose one canonical name in deployment configuration. |
| `GITHUB_OAUTH_CLIENT_ID` | GitHub sign-in | Not required until GitHub OAuth login is enabled. |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub sign-in | Not required until GitHub OAuth login is enabled; server-only. |
| `GITHUB_OAUTH_REDIRECT_URI` | GitHub OAuth callback | Not required until GitHub OAuth login is enabled. |
| `RESEND_API_KEY` | Password reset/transactional email | Optional; the application can run without email delivery. |
| `RECAPTCHA_SITE_KEY` | Browser CAPTCHA | Optional. |
| `RECAPTCHA_SECRET_KEY` | Server CAPTCHA verification | Optional; server-only. |
| `DESMOS_API_KEY` | Desmos integration | Optional; the current code reads this exact name. |
| `KV_REST_API_URL` and `KV_REST_API_TOKEN` | Shared cache/rate-limit fallback | Optional; server falls back to local/volatile behavior where implemented. |
| `WORKSPACE` | Workspace metadata override | Optional; a default exists. |
| `GITPAGE_URL` | Public project/page link | Optional; this is the current code’s name, not `GITHUB_URL`. |
| `ENFORCE_CSRF` | Cookie-authenticated write protection | Recommended `true` in production. |
| `NODE_ENV` | Runtime mode | Vercel normally supplies production context; set explicitly only when needed. |

Do not add provider-generated `NEXT_PUBLIC_` versions of database URLs, service-role keys, secret keys, Blob tokens, PATs, JWT secrets, OAuth secrets, or App private keys. The static client does not need Supabase privileged credentials.

## Vercel serverless module compatibility

The Vercel runtime evidence showed `ERR_REQUIRE_ESM` while loading `@octokit/rest` from the CommonJS-emitted `src/api/_shared.js`. The current `@octokit/rest` and `@octokit/auth-app` packages are ESM-only according to their package metadata.[7] [8] They must not be statically imported by server files that Vercel wraps as CommonJS. `src/lib/octokit-loader.ts` now performs native dynamic imports at request time, and both the shared GitHub helper and GitHub App helper use that loader. This keeps unrelated public routes such as `/api/config`, `/api/session`, and `/api/themes` from crashing during function initialization; it does not imply that GitHub write credentials are configured.

If a future deployment reports the same error, inspect the compiled helper for a top-level `require("@octokit/rest")` or `require("@octokit/auth-app")`. The correct deployment must contain dynamic `import()` calls instead, followed by a fresh Vercel deployment rather than relying on a previously cached function bundle.

## GitHub Actions and Vercel project linking

The deployment workflow must use the Vercel project that is linked to `fsr-official/NoteBooks-Framework`. The error `Could not retrieve Project Settings. To link your Project, remove the .vercel directory and deploy again.` means the deployment token, organization ID, and project ID do not resolve to the same accessible Vercel project. It is not a Supabase connection error.

The deployment workflow now uses Vercel’s explicit CLI sequence rather than relying on the third-party `amondnet/vercel-action` project-link behavior. Vercel documents `--project` as accepting a project name or ID, and `--environment=production` as the production pull target.[5]

```text
npm run build
npx vercel pull --yes --environment=production --project="$VERCEL_PROJECT_ID"
npx vercel build --prod --project="$VERCEL_PROJECT_ID"
npx vercel deploy --prebuilt --prod --project="$VERCEL_PROJECT_ID"
```

Configure these as GitHub Actions repository secrets, not as Vercel runtime variables:

| GitHub secret | Where to obtain it | Rule |
|---|---|---|
| `VERCEL_TOKEN` | Vercel account settings → Tokens | Create a token with access to the team/project used by the workflow. |
| `VERCEL_PROJECT_ID` | Correct Vercel project settings or `.vercel/project.json` after linking locally | Must be the project linked to `fsr-official/NoteBooks-Framework`. |

`VERCEL_ENVIRONMENT` is **not** a secret and is no longer read by the workflow; production is intentionally selected with the literal `--environment=production` and `--prod` flags. `VERCEL_ORG_ID` is also not required by the corrected workflow because it passes the project ID directly. Do not create placeholder secrets for either name.

To obtain the project ID locally without committing it, run `npx vercel link`, select the correct team and project, then read `.vercel/project.json`. Delete `.vercel` after extracting the ID if it is not intended to be part of the repository. Never commit the token or a file containing secret values. If the token cannot access the project by ID, create a new token under the correct Vercel account/team or use the correct project ID; do not restore an invalid `--scope` value.

The repository branch and deployment trigger must also agree. A workflow configured for `push.branches: [main]` will not run for a `whoami` push. Use `whoami` for staging/Preview or create a separate production workflow for `main`; do not label a `main` deployment as staging unless that is intentional.

## Provider-managed Supabase variables

Vercel may generate names such as `NOTEBOOKS_STORAGE_POSTGRES_URL`, `NOTEBOOKS_STORAGE_POSTGRES_URL_NON_POOLING`, `NOTEBOOKS_STORAGE_POSTGRES_PRISMA_URL`, `NOTEBOOKS_STORAGE_SUPABASE_URL`, `NOTEBOOKS_STORAGE_SUPABASE_ANON_KEY`, and related publishable/service keys when a Supabase integration is connected. These are integration metadata and alternate connection forms. They are not substitutes for `DATABASE_URL` unless the application is explicitly changed to read one of them.

Keep integration-managed variables only while the Vercel/Supabase integration needs them. Remove them later only after confirming that no connected integration, project, or deployment depends on them. In particular, a Supabase service-role key is privileged and must never be exposed to browser code.

## Administrator provisioning boundary

There is **no hardcoded administrator email or password in the current application source**. This is intentional and must remain true. The role catalog contains `super_admin`, and a database migration maps legacy `users.role = 'admin'` records to the `super_admin` role key, but the migration does not invent a person or password.

The initial administrator must be provisioned as a one-time controlled database operation or an authenticated admin bootstrap flow. The password must be bcrypt-hashed before storage, the account must be enrolled in TOTP, and the resulting role must be verified against the `user_roles` table. A password must never be committed to GitHub, written in a migration, placed in `vercel.json`, or added as a static environment variable.

The correct release procedure is:

1. Confirm `DATABASE_URL` points to `NoteBooks-Project`.
2. Create or identify the intended user row using the account owner’s private input.
3. Hash the password using the application’s existing bcrypt dependency.
4. Set the legacy role to `admin` and assign `super_admin` in `user_roles`.
5. Enroll and verify TOTP through the existing protected flow.
6. Test login, TOTP, session creation, one admin read, and one deliberately controlled admin write.
7. Rotate any temporary bootstrap credential immediately after verification.

Until this procedure is completed against the production database, the account should be described as **not provisioned**, not as a hardcoded Super Admin.

## Implemented versus not implemented

### Implemented and release-visible

The current release candidate includes registry-first routing, eager stream tree generation, raw/source delivery, browser sessions, theme families and light/dark mode, reading controls, accessible tree navigation, Community and Issues workspace routes, private upload protection, SVG sanitization, raster-in-SVG fallback metadata, Biology/Chemistry figure fences, Markdown callouts/figures, strict Mermaid security, and database migrations for the current persistence model.

### Not required for the current core release

The following capabilities may remain absent without blocking the basic educational reader, registry, raw delivery, settings, themes, and database-backed session flow: GitHub OAuth login, GitHub App PR approval, signed GitHub webhooks, shared KV, email delivery, CAPTCHA, Desmos API credentials, and volunteer automation.

### Not implemented yet and must remain documented as future scope

| Capability | Why it is not being represented as complete |
|---|---|
| Full GitHub OAuth account lifecycle | Requires provider registration, callback configuration, account-linking policy, token storage/rotation, and end-to-end tests. |
| GitHub App-based PR approval and merge | Requires App installation permissions, private-key handling, review policy, branch protections, audit records, and real repository tests. |
| Complete Community moderation governance | Base channels, messages, reports, and role checks exist, but production RLS and a complete moderator operating procedure remain required. |
| Volunteer task distribution and chat workflow | Requires task assignment, skill routing, queue retry semantics, file retention policy, and abuse controls. |
| PDF OCR pipeline | Requires a controlled worker/toolchain, text-preservation detection, OCR artifact storage, and size/time limits. |
| AI NoteGen/NoteChk integration | The planned workflow uses external Claude tooling rather than an embedded model; no in-app AI generation should be implied. |
| True raster vector tracing | The current no-binary-safe path produces an SVG container with an embedded raster and explicit `vectorized: false` metadata. Potrace/OpenCV tracing requires a separately operated worker or compatible deployment image. |
| Production RLS policy set | Supabase schema exists, but table-specific policies must be written and tested before broad production use. |
| Full observability and retention policy | Runtime logs, audit events, and privacy/retention rules require a documented operational owner. |

“Push the not-implemented parts” means push this roadmap and the safe interfaces/documentation—not fake endpoints, placeholder credentials, or incomplete security behavior presented as production features.

## Release gates

| Gate | Required evidence |
|---|---|
| Vercel project identity | Project is linked to `fsr-official/NoteBooks-Framework`, not the unrelated science/Next.js repository. |
| Environment contract | `DATABASE_URL`, `DB_SSL`, `JWT_SECRET`, `GITHUB_BRANCH`, `APP_URL`, and `BLOB_READ_WRITE_TOKEN` are correct for the target environment. |
| Database target | Connection resolves to `NoteBooks-Project` ref `xnncmzrxzzzylkxunpux`; migrations and schema checks pass. |
| Administrator | Account is provisioned through a controlled flow, TOTP works, and no credential is committed. |
| RLS | Policies exist for every table that can be reached by a browser or service role boundary, and negative tests prove unauthorized access is denied. |
| Build | `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, and production audit pass from the commit being deployed. |
| Runtime | Preview tests cover health, registry, raw delivery, sessions, themes, upload protection, and relevant GitHub actions. |
| Rollback | The deployed commit, migration state, environment owner, and rollback procedure are recorded. |

## References

[1]: https://supabase.com/docs/guides/database/connecting-to-postgres "Supabase: Connect to your database"
[2]: https://vercel.com/docs/vercel-blob/using-blob-sdk "Vercel Blob SDK and environment variables"
[3]: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation "GitHub App installation authentication"
[4]: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app "Creating a GitHub OAuth App"
[5]: https://vercel.com/docs/cli/global-options "Vercel CLI global options"
[6]: https://vercel.com/docs/cli/pull "Vercel CLI pull"
[7]: https://www.npmjs.com/package/@octokit/rest "@octokit/rest package"
[8]: https://www.npmjs.com/package/@octokit/auth-app "@octokit/auth-app package"
