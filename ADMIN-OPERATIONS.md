# Admin operations and recovery

This runbook covers production operations for the private `/admin` console. No production migration, backup, restore, or workflow run is verified by this document; those actions require access to the configured Supabase, hosting, GitHub, and QStash projects.

## Database migrations

The Supabase catalog is the live source of truth for repositories. Before changing production:

1. Confirm the linked Supabase project is the intended production project; do not infer it from the current shell or repository name.
2. Verify a recent managed backup or point-in-time recovery window is available. For higher-risk changes, create an export using the supported Supabase CLI procedure and store it encrypted outside this repository.
3. Check migration status, then apply pending migrations in order using the Supabase CLI. The admin console requires `20261116100000_admin_dashboard.sql`; AI key controls require `20261119120000_ai_provider_key_admin.sql`; account AI usage reporting also requires `20261118200000_ai_usage_tracking.sql`.
4. Deploy the application only after migrations succeed. The updated AI chat route requires the provider-key control functions to select a key; applying the migration first avoids a period where chat returns an unavailable response.
5. Verify `/admin` access, repository listing, AI provider key status, and a staging AI request. Confirm the admin audit event is recorded. Do not use real student content for smoke tests.

Migrations are additive and should be treated as forward-only once applied. If a migration or deployment fails, stop and inspect the Supabase migration history and provider logs. Prefer correcting the migration with a new forward migration or rolling back the application deployment while leaving the additive schema in place. Do not manually mark a failed migration as applied or drop production objects without first assessing their data and dependencies.

## Required configuration

Keep all server secrets in the hosting provider's server-only environment. Never use `NEXT_PUBLIC_` for a secret.

| Purpose | Configuration |
| --- | --- |
| Supabase | `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; the browser also needs the public Supabase URL and publishable key. |
| AI chat | One or more `GROQ_API_KEY_*` slots, `KV_REST_API_URL`, and `KV_REST_API_TOKEN`. |
| Repository operations | A GitHub token with the access needed to read configured repositories; QStash token and signing keys; `APP_BASE_URL`; server `WEBHOOK_SECRET`. |
| Scheduled reconciliation | `REPOSITORY_RECONCILIATION_SECRET` on the server and the same value as a GitHub Actions secret; `APP_BASE_URL` as a GitHub Actions secret. |
| Account CAPTCHA | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` for the widget and server-only `TURNSTILE_SECRET_KEY`; Supabase Auth CAPTCHA must use the matching Turnstile secret. |
| Initial admin claim | A temporary, server-only `ADMIN_BOOTSTRAP_TOKEN` with at least 32 random bytes; remove it after the first administrator claims the role. |

Rotate a secret at its provider, update all matching environments in the same maintenance window, and redeploy/restart services that read it at startup. Never put secret values in issue reports, source control, or this runbook.

## Backup, restore, and rollback

- Keep Supabase-managed backups or point-in-time recovery enabled according to the project's service tier. Confirm retention and recovery access with the project owner.
- Before a production migration, confirm the most recent recovery point and create an encrypted export when the change warrants it. Store backup material in a restricted location separate from this repository and record the recovery point, not the secret-bearing dump contents.
- Periodically rehearse restoring into a separate non-production project. Verify schema, account access, repository catalog integrity, and regenerated public indexes before considering the restore procedure tested.
- A database restore can discard writes made after its recovery point. Pause repository updates during restoration, then reconcile enabled repositories and rebuild the public indexes from the restored database.
- Prefer application rollback plus a new forward migration over destructive schema rollback. Take a fresh backup before any manual repair and record the exact project, migration version, and operator action.

## Repository and AI recovery

- Repository syncs use 10 deterministic QStash shards, with queue parallelism 1. Repositories always map to the same shard, so their syncs remain serialized; different repositories sharing a shard wait in that shard's FIFO queue.
- When migrating from the previous per-repository queue names, pause scheduled, webhook, and manual sync triggers and allow all old queues to drain, including retries and duplicate jobs. Do not delete queues with pending or processing messages. After confirming they are empty, delete the old `repo-update-<hash>` queues to free the QStash queue quota, deploy the sharded version, re-enable the triggers, then run one reconciliation and verify all enabled repositories were queued.
- A missed GitHub webhook can be repaired by running the daily or manually dispatched `repository-reconciliation` workflow. The route confirms that work was enqueued; check QStash and the admin sync-run history to confirm worker completion.
- An administrator can queue a repository check or rebuild public indexes from `/admin`. Rebuild indexes after restoring the database or when Redis cache contents are missing.
- Groq rate limits automatically cool down the affected key slot. An administrator can disable a configured slot in `/admin`; re-enabling clears its cooldown. Secret values are changed only in the hosting environment, not in the console.
- If all provider slots are disabled, unconfigured, or cooling down, AI requests return an unavailable/limit response. Restore at least one configured, enabled slot and verify the status panel before testing chat again.
- API/page metrics and AI provider usage are aggregates. Prompts and anonymous visitor identifiers are not part of the AI provider usage records.
