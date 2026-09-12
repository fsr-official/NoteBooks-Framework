# NoteBooks v1.0.0 Production-Release Audit

**Audit date:** 25 August 2026. **Scope:** current source tree, selected GitHub repository, accessible Vercel team/project metadata, active Supabase project, local build/test pipeline, and release configuration.

## Executive result

The application source is a strong v1.0.0 candidate, but it is **not yet safe to promote to production** until two external release gates are closed: the Vercel project must point to the current `fsr-official/NoteBooks-Framework` Express repository, and Supabase Row Level Security must be designed and enabled with intentional policies for the application’s access model. The local code suite and known additive schema reconciliation pass.

## Evidence summary

| Area | Finding | Status |
| --- | --- | --- |
| Source repository | `fsr-official/NoteBooks-Framework` exists; `whoami` is an unprotected staging branch. | Ready for a verified push. |
| Local quality | 34 test files passed, 107 tests passed, 2 DB integration tests skipped without opt-in; typecheck/build/audit passed. | Pass. |
| Runtime alignment | Package now declares Node `>=22 <25` and npm `>=10`; CI and staging workflow Node versions are aligned to 22. | Pass locally; workflow run should be confirmed after push. |
| Supabase project | `NoteBooks-Project` is active and healthy in `ap-northeast-2`. Known additive migrations for banned accounts, community subject, browser sessions, theme mode, and light tokens were applied successfully. | Schema path improved; verify complete history before tag. |
| Supabase security | Advisor reports 16 tables with RLS disabled. It also reports nine RLS-enabled tables with no policies. | **Release blocker.** Do not apply blanket RLS enablement without policies. |
| Supabase performance | Advisor reports unindexed foreign keys and unused indexes. | Review before scale; not the immediate launch blocker. |
| Vercel | Accessible linked project is `notebooks-science-framework`, linked to `hsxtheemperor/NoteBooks-Science-Framework`, framework `nextjs`, and latest deployment state `ERROR`. | **Release blocker.** Link the current repository/project. |
| GitHub Actions secrets | Repository secret listing returned HTTP 403 from the current token scope. | Cannot verify remotely; configure and verify through repository settings or an appropriately scoped credential. |

## Supabase security finding

The Supabase advisor specifically reports RLS disabled on `public.users`, `public.volunteer_groups`, `public.user_groups`, `public.admin_hierarchy`, `public.reset_tokens`, `public.reset_cooldowns`, `public.community_posts`, `public.github_installations`, `public.webhook_deliveries`, `public.dashboard_activity`, `public.theme_presets`, `public.theme_preferences`, `public.issue_proposals`, `public.issue_votes`, `public.pr_lifecycle`, and `public.audit_events`. The advisor also reports RLS enabled without policies on `app_roles`, `user_roles`, `community_channels`, `community_channel_members`, `community_messages`, `community_message_reports`, `community_moderation_events`, `issue_proposal_comments`, and `issue_proposal_reviews`.

This is a real security boundary, not a cosmetic warning. Supabase’s own RLS guidance explains the purpose of row-level policies and the consequences of exposing tables through client-facing roles.[1] The safe remediation is to model the server’s actual database connection and access pattern, add table-specific policies or keep all direct client access disabled while using a tightly protected server connection, test reads/writes with anon/authenticated roles, and only then enable RLS on the remaining tables. The advisor’s blanket remediation SQL was **not** auto-applied because enabling RLS without policies can block legitimate application access while leaving policy intent undefined.

## Migration reconciliation

The production migration history initially contained the eight early application migrations. The following additive migrations were then applied successfully through the Supabase migration interface:

| Migration | Purpose |
| --- | --- |
| `add_banned_until` | Account suspension timestamp and lookup index. |
| `add_community_subject` | Subject context and index for Community posts. |
| `browser_sessions` | Opaque browser-session storage and expiry indexes. |
| `theme_mode` | Paired light/dark session preference with a check constraint. |
| `theme_light_tokens` | Optional light token set for theme presets. |

The resulting schema exposes `browser_sessions`, `selected_theme_mode`, and `theme_presets.light_tokens`. The production history uses names generated at application time and should still be reconciled against the full repository migration ledger before a production tag; no destructive migration was performed in this audit.

## Vercel finding

The accessible Vercel team contains a project named `notebooks-science-framework` whose Git link is `hsxtheemperor/NoteBooks-Science-Framework`, whose framework is reported as `nextjs`, and whose latest deployment is in an error state. That is not the selected `fsr-official/NoteBooks-Framework` repository and does not represent the current Express/static application. The failed deployment’s visible warnings reference an invalid `experimental.serverActions` value and unsupported viewport metadata, which further confirms that it belongs to the unrelated Next.js project.

Before release, create or relink the correct Git-connected Vercel project under the intended team, set the root directory and build command to this repository’s `npm run build`, configure the environment variables from the root README, and deploy `whoami` to preview. Do not promote the currently observed Next.js project as NoteBooks v1.0.0.

## GitHub and workflow finding

The selected repository has `main`, `whoami`, and `iamyou` branches. The `whoami` branch is currently unprotected. CI, database integration, and staging workflows were aligned to Node 22 in the source tree. The staging workflow still depends on `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`, while the GitHub App environment fields are passed only where the workflow uses them. The current token scope could not list repository Actions secrets and returned HTTP 403; secret presence therefore remains an owner-side verification item.

## Local verification

The following checks passed from the current source tree:

```text
npm test                         34 files passed; 107 tests passed; 2 DB tests skipped without opt-in
npm run build                   passed; manifest, registry, stream trees, client, server
npm audit --omit=dev            0 vulnerabilities
TypeScript compilation         passed through the build and typecheck configuration
Browser JavaScript syntax      passed in the prior renderer/upload validation
HTTP smoke checks              passed for shell, Settings, scripts, starter SVG, service worker
```

The browser session itself was intermittently unavailable during the previous visual pass, so HTTP smoke checks were used for static availability. A real-browser pass against the corrected Vercel preview is still required before the release tag.

## Release decision

**Decision: HOLD v1.0.0 promotion.** Push the verified source to `whoami`, correct the Vercel linkage, configure production variables, resolve Supabase RLS policy design/testing, run a real-browser preview pass, and then promote the same commit. The local implementation should not be described as fully production-ready until those external gates are recorded as passed.

## References

[1]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase Row Level Security documentation"
[2]: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy "Supabase database linter: RLS enabled without policy"
[3]: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys "Supabase database linter: unindexed foreign keys"
