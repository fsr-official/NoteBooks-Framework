# Supabase RLS Audit Baseline

**Project:** NoteBooks-Project
**Project ref:** `xnncmzrxzzzylkxunpux`
**Status:** ACTIVE_HEALTHY
**Database engine:** PostgreSQL 17.6.1.155
**Region:** ap-northeast-2
**Source:** Supabase MCP `list_projects` and `list_tables` results, 2026-08-26.

## Critical advisory

Supabase reports that Row Level Security is disabled on 17 public tables: `users`, `volunteer_groups`, `user_groups`, `admin_hierarchy`, `reset_tokens`, `reset_cooldowns`, `community_posts`, `github_installations`, `webhook_deliveries`, `dashboard_activity`, `theme_presets`, `theme_preferences`, `issue_proposals`, `issue_votes`, `pr_lifecycle`, `audit_events`, and `browser_sessions`.

Supabase explicitly warned that these tables were exposed to the anon and authenticated roles used by Supabase client libraries. It also warned not to auto-apply the remediation SQL because enabling RLS without policies blocks access. After explicit user approval, the 17-table deny-by-default change was applied to the empty active project through the named database change `enable_rls_deny_by_default_public_tables`.

## Additional security findings

Supabase also reports nine tables where RLS is enabled but no policies exist: `app_roles`, `community_channel_members`, `community_channels`, `community_message_reports`, `community_messages`, `community_moderation_events`, `issue_proposal_comments`, `issue_proposal_reviews`, and `user_roles`. These require explicit policy design before any access path is moved to a restricted role.

## Performance findings

The performance advisor reports unindexed foreign keys on administrative, community, issue, theme, role, and lifecycle tables. It also reports indexes that have not yet been used. Unused-index findings should not be removed automatically because the database is currently lightly populated and the application may not have representative production traffic. Foreign-key indexes should be reviewed against actual query plans before migration.

## Initial policy plan

The application uses a server-side `pg` connection and application-level permission middleware rather than direct browser Supabase table access. The safe migration plan is therefore to inventory every table’s server query surface, decide whether the service role is the only database role used by the server, add table-specific policies for any direct client role that must remain, test all public reads and authenticated, moderator, and admin writes, and only then enable RLS in bounded migrations.

Sensitive tables such as `users`, `reset_tokens`, `reset_cooldowns`, `github_installations`, `webhook_deliveries`, `audit_events`, and `browser_sessions` require deny-by-default policies or server-only access. Public feed and theme preset tables need narrowly scoped read policies. User-owned preference, vote, activity, and proposal records require identity-scoped policies. Role and admin tables require admin-only policy paths.

## Post-change verification

All 26 public tables now report `rls_enabled: true`. The project contained one existing user row, 15 app-role rows, one user-role row, and seven community-channel rows; no rows were modified or deleted. The nine tables that already had RLS enabled and no policies remain deny-by-default. Because the application uses server-side `pg`, direct anon/authenticated table access is not required by the current architecture. Any future direct Supabase client access must receive an explicit, table-specific policy and integration test.

The Supabase RLS documentation and linter guidance are available at https://supabase.com/docs/guides/database/postgres/row-level-security and https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.
