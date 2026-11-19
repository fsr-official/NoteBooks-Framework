# Database and repository update design

This document records the current Supabase schema and repository import behavior. The initial catalog migrations and API-key migration have been applied to the configured remote project. The admin dashboard migration is new and still needs to be applied; local Supabase remains unverified.

## Accounts and authentication

Anyone may sign up with a permanent unique User ID, an editable User Name, and email/password or GitHub OAuth. Supabase Auth owns credentials; passwords must never be stored in application tables or in plaintext. The User ID is immutable after initial OAuth setup; the User Name is not unique and is never used for account binding. Keep the Supabase service-role key server-only.

Supabase Auth stores credentials in its managed `auth.users` table. The application adds a `public.accounts` table for account IDs and roles, and one shared `public.repository_entries` table for both repository metadata and file records. The accounts table is separate because login identities and repository records have different lifecycles and security rules.

Every new account receives the `user` role. Only the single designated account may have the `admin` role; a partial unique index enforces at most one admin. Users cannot assign or change their own roles. The first admin signs in after account registration and claims the role through `/admin` using a one-time server-only `ADMIN_BOOTSTRAP_TOKEN`; remove the token from the deployment environment after the claim. A trigger creates the account row from the Supabase Auth signup metadata and always assigns `user`.

### Admin operations migration

Apply [`20261116100000_admin_dashboard.sql`](supabase/migrations/20261116100000_admin_dashboard.sql) after the existing migrations before using the operations console. It adds `last_checked_at`, permits null `account_id` values for automated repository imports while retaining optional account assignment, adds aggregate API/page-view metrics, bounded sync-run and audit history, and a dashboard snapshot function. Metrics contain route/method counts and durations only; they do not capture request bodies, query strings, IP addresses, tokens, or response contents.

The `/admin` console supports repository creation, editing, account assignment, disabling, and soft archive/restore. Changes rebuild the public indexes. Manual checks queue enabled repositories through QStash and are processed by the existing signed worker; queue acceptance does not mean the sync has already completed. Sync runs retain their status, duration, changed commit, file count, requesting admin, and a generic failure code, but not raw upstream error text. API traffic and public library page views aggregate in one-minute buckets. The activity panel is an application audit trail; detailed runtime logs remain available in the hosting provider's dashboard.

The content API uses separate per-account API keys. Only a verified Supabase Auth user with an existing `public.accounts` profile may create a key. The server returns the random key once and stores only its SHA-256 hash and non-secret display prefix. Keys can be listed by metadata and revoked by the owning account; a database function enforces a maximum of five active keys per account. The application stores no password or recoverable API-key secret.

The additive API-key and file-lookup functions are defined in [`20261114184000_api_key_access.sql`](supabase/migrations/20261114184000_api_key_access.sql). This migration is applied remotely. File download lookup is service-role-only and returns only enabled, non-archived repository metadata for an exact catalogued file path.

Apply [`20261117090000_account_identity_and_sessions.sql`](supabase/migrations/20261117090000_account_identity_and_sessions.sql) before using the updated GitHub OAuth callback. It stores the verified GitHub provider ID and username, adds server-only browser-session bindings, and makes a chosen User ID immutable after OAuth setup. GitHub’s username is a suggestion only; users may choose another available User ID before completing setup.

The profile table has these alphabetically ordered columns:

| Column | Proposed type | Purpose |
| --- | --- | --- |
| `account_id` | `text` | Permanent unique User ID after setup; 3-32 lowercase letters, digits, underscores, or hyphens, beginning with a letter or digit. |
| `auth_user_id` | `uuid` | Primary key and foreign key to `auth.users.id`; deleting the Auth user cascades to this profile. |
| `created_at` | `timestamptz` | Profile creation time. |
| `github_user_id` | `text`, nullable | Stable GitHub provider ID returned by Supabase Auth; unique when present. |
| `github_username` | `text`, nullable | GitHub username captured from the verified provider identity; not used for account binding. |
| `role` | `text` | `user` by default, or `admin`; a partial unique index permits at most one admin. |
| `updated_at` | `timestamptz` | Automatically maintained profile update time. |
| `user_name` | `text` | Editable display name, 1-40 characters, not unique and not used for account binding. |

`public.account_sessions` privately maps the browser’s UUID session ID to the verified Supabase Auth user. Only server-side service-role routes can read or write these bindings; the browser’s local signed-in display is informational and is never used to authorize API access.

## Shared repository and file table

Use one shared PostgreSQL table named `public.repository_entries`. It contains one `repository` anchor row per configured repository and one `file` row per tracked file. This keeps file-level updates and queries practical while retaining an anchor for repositories with no files. Each file row has a stable unique ID and a `repo_id` foreign key to its repository anchor. Repository metadata is stored once on the anchor, not copied onto every file. Its columns are alphabetically ordered:

| Column | Proposed type | Purpose |
| --- | --- | --- |
| `account_id` | `text`, nullable | Application account ID responsible for a repository; populated on repository anchors and references `public.accounts.account_id`. |
| `archived_at` | `timestamptz`, nullable | Set when a repository is removed from the active registry; null means active. Populated only on repository anchors. |
| `branch` | `text`, nullable | Configured branch to monitor and read; populated on repository anchors. |
| `class_or_stream` | `text`, nullable | Tree grouping: `lowersecondary`, `science`, `commerce`, `humanities`, or `developer`; populated on repository anchors. |
| `created_at` | `timestamptz` | Time this entry was created. |
| `empty` | `boolean`, nullable | Registry marks a repository intentionally empty; populated on repository anchors. |
| `enabled` | `boolean`, nullable | Whether this repository participates in synchronization; populated on repository anchors. |
| `fallback` | `text`, nullable | Optional manifest fallback, currently `github-tree`; populated on repository anchors. |
| `file_name` | `text`, nullable | File name; populated on file rows. |
| `file_path` | `text`, nullable | File path relative to the repository root; populated on file rows. |
| `file_sha` | `text`, nullable | Git blob SHA for the file; populated on file rows. |
| `id` | `uuid` | Stable primary key for this entry; on file rows this is the unique file-record ID. |
| `last_checked_at` | `timestamptz`, nullable | Time of the most recent successful upstream commit check; populated on repository anchors. |
| `last_commit_sha` | `text`, nullable | Latest successfully synchronized commit SHA; populated on repository anchors. |
| `last_updated_at` | `timestamptz`, nullable | Time the repository's latest state was successfully synchronized; populated on repository anchors. |
| `lfs` | `boolean`, nullable | Whether the repository uses the media delivery path for LFS; populated on repository anchors. |
| `pages` | `boolean`, nullable | Whether GitHub Pages is enabled as a manifest fallback; populated on repository anchors. |
| `priority` | `integer`, nullable | Registry display/order priority; populated on repository anchors. |
| `record_type` | `text` | Either `repository` or `file`; determines which fields must be populated. |
| `registry_name` | `text`, nullable | Human-readable registry name; populated on repository anchors. |
| `repo_id` | `uuid`, nullable | File rows reference the parent repository anchor's `id`; null on repository anchors. |
| `repo_name` | `text`, nullable | GitHub repository name; populated on repository anchors. |
| `repo_owner` | `text`, nullable | GitHub owner or organization name; populated on repository anchors. |
| `root` | `text`, nullable | Repository subdirectory containing `files.json`, if configured; populated on repository anchors. |
| `updated_at` | `timestamptz` | Time this entry was last written. |

Database checks enforce mutually exclusive repository/file row shapes, valid tree groups, and relative file paths. Unique indexes prevent duplicate GitHub repositories and duplicate paths within a repository. A self-reference foreign key cascades deletes to child file rows; a trigger additionally ensures `repo_id` references a repository anchor rather than another file row.

The initial migration is [`20261113193000_initial_schema.sql`](supabase/migrations/20261113193000_initial_schema.sql). The service-role grant migration is [`20261113211500_grant_service_role.sql`](supabase/migrations/20261113211500_grant_service_role.sql). The repository import migration adds source registry metadata and a transactional sync function; [`20261113223000_fix_file_row_defaults.sql`](supabase/migrations/20261113223000_fix_file_row_defaults.sql) ensures repository-only defaults do not leak into file rows. Together they create the account profile and shared repository/file table, including constraints, indexes, triggers, and RLS policies. Repository names are unique case-insensitively. All four migrations are applied to the configured remote project; the local Supabase database has not yet been started or validated.

The shared import registry is [`GITHUB-REPOSITORIES.md`](GITHUB-REPOSITORIES.md). The TypeScript importer parses its enabled rows, excludes Issues and Community, fetches each branch head, and reads `files.json` at that exact commit. It follows the existing framework behavior by trying raw GitHub first, Pages when configured, and the recursive GitHub tree when explicitly configured. If a manifest file is missing a Git blob SHA, the importer fills it from the recursive tree at the same commit; it will not write a file without a valid SHA.

Run `pnpm repos:sync` for a read-only preview. Run `pnpm repos:sync:apply` to call the transactional, idempotent `sync_repository_catalog` RPC, one repository at a time. Repository `account_id` values are intentionally null in the initial import until the responsible NoteBooks account is created and assigned. Both migrations are applied to the configured remote project; the local Supabase database has not yet been started or validated.

When a repository is removed from the active registry, set `archived_at` on its anchor and retain its anchor and file rows. If it is added again, clear `archived_at` and synchronize it. Exclude archived repositories from generated trees. During active sync, insert rows for new paths, update the `file_sha` for changed paths, and delete rows no longer present in the authoritative manifest. Update the repository anchor's commit SHA and sync timestamp only after its file update succeeds. Generated tree JSON is derived output, not a second source of truth.

## Repository list configuration

Use a shared `GITHUB-REPOSITORIES.md` file in the v2 project as the canonical list of repositories and branches to synchronize. It should contain a consistently formatted table with the repository owner, repository name, branch, application account ID, and class/stream grouping. The admin dashboard is allowed to edit the file through a protected server-side operation; ordinary website visitors can only read its published contents. Do not expose filesystem write access or Supabase service credentials to the browser.

Validate edits before saving: required values must be present, repository/branch identifiers must be valid, repositories must not be duplicated, and the grouping must be one of the supported tree groups. Save changes atomically, then synchronize the affected repositories into Supabase. If synchronization fails, report the failure in the admin dashboard and allow a retry; do not present unsynchronized configuration as a successful database update.

Generate five section indexes and one repository registry index from `repository_entries`. Class 9 and Class 10 repositories share the `lowersecondary` group and `lowersecondary-tree` index. Each index is published in both compact, keyed JSON for direct browser lookup and JSONL for record streaming/export. JSONL is a line-delimited record feed; clients needing random access should use the keyed JSON representation. The six logical indexes are `lowersecondary-tree`, `science-tree`, `commerce-tree`, `humanities-tree`, `developer-tree`, and `github_repositories`.

The generated assets are stored in Upstash Redis and exposed through the public Next.js route `/api/public/json/{filename}`; they are not written into the deployment's `public/` filesystem. This keeps Supabase as the source of truth while allowing CDN-cacheable public reads. Configure `KV_REST_API_URL` and `KV_REST_API_TOKEN` on the server. Each JSON index maps stable repository/path identifiers to the repository ID, branch, relative path, and file SHA. Repository metadata is published separately in `github_repositories`.

Rebuild only the affected section after a file synchronization. Repository metadata changes must rebuild `github_repositories`; if a repository's stream changes, rebuild both the previous and new section as well. A full rebuild should be used for initial publication or recovery.

## Admin access and database security

Use Supabase Auth for ID/email/password registration and password verification rather than storing or comparing a password in application code. Public sign-up is enabled; all signups receive the `user` role. The initial admin account is selected and promoted by an operator after signup. Do not store passwords or password hashes in `public.accounts` or `public.repository_entries`.

Protect admin APIs with authenticated server-side authorization checks. Use secure, HTTP-only, same-site session cookies, CSRF protection for state-changing requests, and login rate limits. Enable Row Level Security and deny anonymous clients access to repository data and writes. Keep the Supabase service-role key and `WEBHOOK_SECRET` on the server only; never bundle either into browser assets.

Authenticated users may read their own account ID and role; only the admin may manage accounts or repository rows. The public website may read only the intended published repository-list view and generated tree JSON. It must not be able to modify the repository list or database records.

## Detecting and synchronizing GitHub commits

### Primary signal: signed GitHub Actions update

The reusable `fmupdate.yaml` workflow generates `files.json` with Git blob SHAs, then calls `fmwebhook.yaml`. That workflow sends the repository and branch to `POST /api/webhooks/repository-update` and signs the exact JSON request body with HMAC-SHA256 using the shared `WEBHOOK_SECRET`. Set the matching secret in the website's server environment and as a GitHub Actions secret; set `WEBSITE_URL` in GitHub Actions to the full endpoint URL.

The endpoint verifies the signature before parsing the request, then enqueues a compact repository/branch job in a QStash FIFO queue dedicated to that repository. Updates for one repository are serialized while distinct repositories can be processed concurrently. The QStash worker verifies its own signature, resolves the repository against the enabled and non-archived database catalog, requires the requested branch to match the configured branch, checks the current GitHub branch head, and syncs files transactionally. It then regenerates only that repository's section indexes in Redis. Repeated deliveries skip the database write but still refresh the section cache, allowing a retry to recover if a previous cache write failed. The initial import rebuilds all six logical indexes in both formats.

The webhook returns an enqueue failure if QStash is unavailable. The QStash worker returns failure for retriable GitHub, database, or Redis errors so QStash retries delivery. Indexes are regenerated from database state after sync.

### Recovery: scheduled commit-SHA check

Webhooks are the fast path, but deliveries can be delayed or exhausted. Run a scheduled reconciliation that checks each configured repository's configured branch head SHA through the GitHub API. If it differs from `last_commit_sha`, run the same manifest comparison and database sync as the webhook path. Also allow an authorized admin to trigger that reconciliation manually.

The queue handles normal updates with per-repository ordering and retries; scheduled reconciliation repairs missed events. Both paths should use the same synchronization logic and database as the source for rebuilding public JSON.

## Content API keys and downloads

The API is documented in [`api/README.md`](api/README.md) with an OpenAPI contract in [`api/openapi.yaml`](api/openapi.yaml). Clients create and revoke API keys using a Supabase Auth access token. File downloads use `GET /api/v1/files?owner=...&repo=...&path=...` and an API key in the Bearer header. A Redis token bucket limits each key to 60 requests per minute, with a burst size of 60. Verified file bodies are cached by Git blob SHA, fetched from the synchronized commit, and capped at 2 MiB.

## Current scope

Issues and Community repositories are excluded for now. They are not part of the repository sync list or generated trees. If introduced later, their data should initially be stored only in Supabase.
