# NoteBooks Phase-2 / Phase-3 Data Model

**Status:** Design baseline for implementation

## Persistence decision

Use **Supabase as hosted PostgreSQL**, not as a second browser-facing state system. The existing Express backend remains the only application write boundary for identity, themes, Dashboard activity, community moderation, issue proposals, votes, PR lifecycle, and audit events. The server connects through the existing `pg` dependency using the Supabase connection string stored in `DATABASE_URL`.

For the Vercel/serverless runtime, the production connection string should use Supabase’s transaction pooler where appropriate. Supabase documents transaction pooling as the option for serverless or edge functions, while direct connections are intended for persistent backends and migrations.[1] The application-side database helper will therefore use a bounded PostgreSQL pool, short connection timeouts, SSL by default, and no application-level fallback to process memory for durable records.

> Supabase’s connection guidance identifies transaction-mode pooling as the fit for serverless functions and recommends SSL wherever possible.[1]

Supabase Data API access is not required for the first activation. If direct browser access is introduced later, every exposed table must have explicit grants and RLS policies; enabling policies alone does not remove existing grants.[2] Until then, the Express server uses the server-side database credential and enforces application authorization before writes.

## Ownership boundaries

| Concern | Canonical owner | Durable state |
|---|---|---|
| Identity and roles | `src/api/auth.ts`, OAuth/TOTP modules, users schema | `users`, reset tables, TOTP columns |
| Public Dashboard | Dashboard API module | activity and profile aggregates |
| Admin control center | protected admin API and admin shell | moderation, theme, PR, and audit records |
| Global themes | theme preset service | `theme_presets` |
| Anonymous custom themes | theme preference service and signed visitor key | `theme_preferences` plus cookie key |
| Community | community API and repository adapter | `community_posts`, repository metadata |
| Issues | issue proposal API and NoteBooks-Issues adapter | `issue_proposals`, `issue_votes` |
| PR lifecycle | Octokit/GitHub App adapter | `pr_lifecycle`, audit events |
| Cross-cutting audit | audit service | `audit_events` |

## Core tables

The existing `users`, `community_posts`, `github_installations`, `webhook_deliveries`, `reset_tokens`, and `reset_cooldowns` tables remain canonical. The Phase-2 migration adds additive columns and the following tables.

### `dashboard_activity`

This is an append-only, bounded activity stream for the public Dashboard. Each record identifies the authenticated user when available, the product area, the action, and optional repository/file context. Anonymous page views are not stored as identity-bearing activity. Retention can later be implemented by deleting records older than a configured period.

### `theme_presets`

This stores administrator-managed global presets. `slug` is stable and unique. `tokens` is JSONB, but the API must validate it against the allowlisted theme token schema before writing. Only active presets are exposed publicly. Admin writes are audited.

### `theme_preferences`

This stores custom theme tokens for either a signed-in user or an anonymous visitor key. The anonymous key is an opaque, random cookie value; it is not an email, IP address, or browser fingerprint. A unique owner key prevents duplicate preference rows. On sign-in, the service can merge the anonymous row into the user row.

### `issue_proposals`

This is the application’s normalized issue/request record. It stores the canonical NoteBooks-Issues repository, the target repository that owns the file, the target branch, the exact file path, proposal content, author, moderation state, GitHub issue metadata, and PR lifecycle summary. The target repository must be resolved server-side from canonical repository metadata; clients may not choose an arbitrary owner/repository for a PR.

Suggested status values are `submitted`, `triaged`, `approved`, `rejected`, `pr_open`, `merged`, `closed`, and `cancelled`. State transitions must be explicit and audited.

### `issue_votes`

Each authenticated user has at most one active vote per issue through a unique `(issue_id, user_id)` constraint. `value` is `1` for upvote and `-1` for downvote. Changing a vote is an update; removing a vote deletes the row. Aggregate counts are calculated by query or maintained transactionally after performance needs are known.

### `pr_lifecycle`

This records every PR associated with an issue proposal, including the target repository, branch, PR number and URL, current state, and timestamps. It is separate from `issue_proposals` so a proposal can have retries or a later replacement PR without losing history.

### `audit_events`

This is an append-only security and workflow log. Events include authentication changes, admin moderation, theme preset changes, issue state transitions, vote changes, Octokit issue/PR creation, approval, rejection, merge, and webhook processing. Payloads must exclude passwords, tokens, private keys, and raw secrets.

## Required constraints and indexes

All user foreign keys reference `users(id)` with appropriate delete behavior. Vote uniqueness is enforced by the database, not only by application checks. Issue lookup is indexed by status, target repository, and creation time. Activity is indexed by user and time, area and time. Theme preferences are unique by owner key. Audit events are indexed by actor, event type, and time. These indexes support both Dashboard reads and RLS policy filters if tables are later exposed through Supabase’s Data API.[2]

## Authentication relationship

The current project has both custom email/password auth and OAuth/TOTP-related modules. Phase-2 should not silently create a second identity system. A user record remains the application identity, with OAuth provider IDs linked to that record. Every authenticated request used for voting, Dashboard personalization, or admin actions must resolve to the same internal `users.id`. Anonymous custom themes use the opaque visitor key only and do not receive voting or moderation authority.

## Activation order

First, harden the PostgreSQL boundary and apply the additive migration. Second, add repository-agnostic data services with deterministic tests and explicit no-database behavior. Third, activate the Dashboard and theme services. Fourth, activate issue proposals and authenticated voting. Finally, connect Octokit PR creation and NoteBooks-Issues recording behind administrator approval and idempotency checks.

## References

[1]: https://supabase.com/docs/guides/database/connecting-to-postgres "Supabase Docs: Connect to your Postgres databases"

[2]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase Docs: Row Level Security"
