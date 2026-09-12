> **Document status:** historical implementation record. For current behavior, use [`docs/README.md`](../../README.md), the root [`README.md`](../../../README.md), and the active architecture/release documents.
>
# Phase-2 / Phase-3 Audit and Decisions

## Confirmed product decisions

The database foundation comes first. Supabase is the preferred production provider, with the application using its PostgreSQL connection through a server-only persistence boundary. The public Dashboard will be visible to every visitor and will summarize each person’s presence across NoteBooks; the administrator view will extend that surface into a protected control center. Global themes are administrator-managed presets. Custom themes are anonymous-capable, user-specific color preferences that can render server-side without requiring sign-in and may later synchronize to an account. Community and Issues are canonically associated with `fsr-official/NoteBooks-Community` and `fsr-official/NoteBooks-Issues`. Votes require sign-in. A content change PR must target the repository that owns the source file, while the proposal, approval/rejection state, and PR metadata are recorded in NoteBooks-Issues.

## Current backend state

The project already has a PostgreSQL helper at `src/lib/db.ts`, ordered SQL migrations, and a broad identity schema containing users, reset tokens, TOTP fields, admin hierarchy, GitHub installations, webhook delivery records, and community posts. It does not yet have a Supabase-specific adapter, row-level security policy set, or a schema for dashboard activity, themes, issue proposals, issue votes, audit events, or repository-native PR records.

Authentication currently supports email/password registration, login, password reset, JWT cookies, optional Redis persistence, and an in-memory fallback. This is testable locally but is not production-safe as a source of truth because Redis and memory fallback can create inconsistent identity state across serverless instances. Database errors are often logged and then downgraded to fallback behavior. Phase-2 should make production persistence fail closed while retaining explicit test doubles for local tests.

TOTP, permissions, admin hierarchy, GitHub App credentials, and Octokit helpers are present and covered by tests. The admin desk currently exposes PR-oriented handlers behind administrator security, but there is no unified Dashboard/control-center data contract yet.

Community posts currently persist to PostgreSQL when `DATABASE_URL` exists and otherwise fall back to process-local memory. Optional GitHub Discussion creation exists. The `/api/issues/feed` route currently reuses the community feed handler rather than reading the canonical NoteBooks-Issues repository or an issue-proposal table. Authenticated upvote/downvote issue persistence is not implemented. The existing community approval path can optionally create a PR through the GitHub App, but its routing and persistence need to be formalized around the owning repository and NoteBooks-Issues audit record.

Themes currently use browser local storage, a cookie endpoint, and client-side preset constants. There is no administrator-managed preset store, user custom-theme table, or server-rendered theme resolution contract. The existing Settings page is an appropriate shell but not yet a complete persistence boundary.

## Implementation recommendation

Use Supabase as hosted PostgreSQL rather than introducing the Supabase browser client for server-owned actions. Start with the existing `pg` boundary and a strict `DATABASE_URL`/Supabase connection configuration. Add explicit migrations for profiles/activity, theme presets and user themes, issue proposals, issue votes with a unique `(issue_id, user_id)` constraint, community moderation records, PR lifecycle records, and audit events. Add RLS policies in Supabase for tables that may later be accessed directly, but keep privileged server actions behind the Express API and service-role credentials stored only in server environment variables.

The Dashboard should be a read-oriented aggregation surface. The admin control center should be a separate protected route and API namespace that composes users, moderation queues, theme presets, issue proposals, votes, PR lifecycle, repository configuration, and audit events without duplicating feature logic. Community and Issues should have separate route modules and separate repository adapters even when they share pagination, identity, and voting primitives.

## Required hardening before activation

Production must not silently fall back to memory for users, votes, issues, or moderation state. Email/password auth needs a clear relationship with the existing OAuth identity model, normalized email uniqueness, reset-token hashing or equivalent protection, and explicit cookie/security configuration. Issue creation must validate the file-owner repository from canonical stream metadata instead of trusting a client-supplied repository. Octokit operations need idempotency keys, bounded request timeouts, clear dry-run tests, and audit records for create, approve, reject, vote, PR-create, and PR-state transitions. Voting must require authenticated identity and enforce one active vote per user per issue. All public feed reads should use bounded pagination and repository/API caching rather than unbounded table or GitHub requests.

## Current decision

Proceed with database schema and adapter design first. Do not activate issue voting or automatic PR creation until persistence, identity resolution, repository ownership validation, and audit recording are in place. Preserve existing dormant modules, but route them through the new contracts incrementally and keep unsupported external integrations guarded.
