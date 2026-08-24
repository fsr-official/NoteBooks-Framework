# NoteBooks Phase-2 / Phase-3 Status Report

**Status:** Foundation implementation complete; the NoteBooks-Project Supabase schema is applied, while application deployment still requires its server-side connection and identity credentials.

## Summary

The NoteBooks backend now has a first usable foundation for the requested Phase-2 and Phase-3 direction. The database boundary is Supabase-compatible without introducing a second browser identity system. Personal Dashboard content is owned by the canonical Settings/account page, while the administrator control center remains a separate surface. Anonymous custom theme persistence is validated and prepared for durable storage. Issues now have a canonical repository feed, authenticated proposal/vote routes, server-side source-repository validation, and a guarded Octokit PR lifecycle boundary.

The Supabase schema and requested account record have been provisioned in the connected NoteBooks-Project project, but the Vercel/application runtime still has no `DATABASE_URL` in this environment. Local behavior therefore remains explicit and safe: public read surfaces render with zero-state data, issue writes and votes return a database-required response, and privileged admin/PR operations remain gated until deployment configuration is updated.

## Implemented boundaries

| Area | Current implementation | Activation status |
|---|---|---|
| Database | `src/lib/db.ts` now uses a bounded SSL-capable PostgreSQL pool with connection and statement timeouts. Migration transactions use one checked-out connection. | Ready for Supabase `DATABASE_URL` |
| Schema | `2026-08-23-phase2-foundations.sql` plus `2026-08-23-role-profile-presence.sql` add activity, presets, theme preferences, issue proposals, votes, PR lifecycle, audit events, role catalog, multi-role assignments, profiles, and presence. | Applied to NoteBooks-Project; Vercel binding pending |
| Personal space | `/settings#personal-space`, `/api/dashboard`, `dashboard.js`, and `dashboard.css` provide the user-owned project-presence view. `/dashboard` remains a compatibility redirect. | Active zero-state and database-aware rendering |
| Admin control center | `/admin` and `/api/admin/dashboard` are separate from legacy `/admin-prs`; privileged API remains protected by administrator security. | Guarded and active as a shell |
| Themes | `/api/theme` was extracted into `src/api/theme.ts`; anonymous custom values are allowlisted, bounded, cookie-backed, and database-ready. | Anonymous cookie flow active; durable sync awaits DB |
| Issues | `/api/issues/feed` reads `fsr-official/NoteBooks-Issues`; proposal creation validates the registered source repository; authenticated vote and vote-removal routes enforce identity; admin PR creation targets the stored source repository and comments back to NoteBooks-Issues. | Routes active; durable workflow awaits DB and GitHub credentials |
| Community | Existing community routes and moderation behavior remain preserved. `/api/community/profile` and `/api/community/profiles` now expose safe public profile fields, role labels, and manually selected Online/DND presence; authenticated members can update their own profile. | API/UI foundation active; real-time presence is not yet implemented |
| Dormant features | OAuth, TOTP, editor, blob, GitHub App, webhook, moderation, and legacy PR-review modules remain available behind their existing guards. | Deliberately not deleted or silently activated |

## Security and correctness decisions

The current custom application identity remains canonical. Supabase is treated as hosted PostgreSQL accessed by the server, rather than introducing Supabase Auth alongside the existing JWT/OAuth/TOTP model. This prevents two competing user identifiers from appearing in votes, Dashboard activity, moderation, and PR audit records.

Issue proposals do not trust a client-selected arbitrary GitHub repository. The server validates `sourceRepository` against the registered NoteBooks repository list and stores the validated repository, branch, and exact file path. The issue vote schema enforces one active vote per `(issue_id, user_id)` at the database level. The PR endpoint is administrator-protected and records the target repository and PR metadata in the new lifecycle table.

The migration enables RLS and revokes `anon` and `authenticated` table grants for the new tables. This is defense in depth for a future Supabase Data API exposure; the current Express server remains the privileged application boundary. Supabase’s current documentation recommends transaction pooling for serverless traffic, SSL connections, and explicit grants/RLS policies for exposed tables.[1] [2]

## Verification evidence

The final local build and regression suite passed with **28 test files and 76 tests** after adding the role/profile regression coverage. The Settings personal-space browser check confirmed the responsive embedded Dashboard, four metric cells, three stream links, anonymous Guest view, and zero visible loading/error state. The admin browser check confirmed the separate control-center shell, clear guarded-state messaging, no exposed privileged metrics, and the sign-in continuation path. The live server returned `200` for `/dashboard`, `/issues`, `/community`, `/api/dashboard`, and `/api/issues/feed`; unauthenticated issue writes and PR creation remain protected.

The local health endpoint may report `degraded` because `DATABASE_URL` and GitHub authentication are intentionally absent in the sandbox. The Commerce artifact continues to use the documented stale fallback because `fsr-commerce/NCERT-Commerce` currently returns `404` for its root `files.json`.

## Required production activation steps

Configure the server-side `DATABASE_URL` in the Vercel deployment for the already-created NoteBooks-Project Supabase database, then run the application-level smoke tests against it. For Vercel/serverless traffic, use the appropriate Supabase transaction-pooler connection string and keep SSL enabled.[1] Configure the existing JWT/OAuth/TOTP/GitHub App credentials, verify the administrator account has the required GitHub link and TOTP enrollment, and run the migration smoke tests against a non-production Supabase project first.

After persistence is live, the next implementation slice should seed administrator-managed theme presets, add Dashboard activity writes at controlled user actions, replace the legacy subject issue-create route with the canonical proposal service, and add audit records around every moderation, vote, issue, and PR transition. A later slice can add Supabase RLS policy tests with the provider’s database test tooling.[2]

## References

[1]: https://supabase.com/docs/guides/database/connecting-to-postgres "Supabase Docs: Connect to your Postgres databases"

[2]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase Docs: Row Level Security"
