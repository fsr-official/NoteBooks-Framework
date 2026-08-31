# Remaining Work Before v1.0.0 Production Release

**Status:** release-gate register. This document intentionally lists only work that can still block a responsible production release or materially improves the post-release roadmap.

## Release blockers found by the final audit

| Blocker | Evidence | Required action |
| --- | --- | --- |
| Vercel project linkage | The accessible team’s linked `notebooks-science-framework` project points to `hsxtheemperor/NoteBooks-Science-Framework` and reports `nextjs`; it is not the selected `fsr-official/NoteBooks-Framework` Express repository. | Relink or create the correct Vercel Git project for this repository, then deploy the `whoami` commit to preview and verify the intended build. |
| Supabase RLS posture | Supabase reports RLS disabled on sixteen application tables, including users, sessions-related application state, themes, Community, Issues, review, and audit tables. | Design and test table-specific policies for the actual server connection model. Do not apply the advisor’s blanket enable-RLS SQL without policies. |
| Supabase migration drift | Production migration history currently contains eight application migrations, while the repository contains additional browser-session and theme migrations. | Reconcile missing migrations through a reviewed staging/backup process and verify schema compatibility before promotion. |
| Production secrets/configuration | The code requires deployment-specific values for JWT, database, GitHub, Blob, and public URL capabilities. GitHub Actions secret listing was not available through the current token scope. | Configure values directly in the intended deployment surfaces and verify capabilities without printing secrets. |

## Required pre-release verification

The following checks must pass against a production-shaped preview: Home → stream → Home routing; eager stream tree loading and keyboard navigation; Settings themes and reading controls; raw view with line numbers; Markdown math, diagrams, figures, and fallback states; authenticated session and TOTP gates; Community and Issues workflows; Blob staging; native SVG sanitization; and upload conversion metadata. The same commit must pass `npm run typecheck`, `npm test`, `npm run build`, and `npm audit --omit=dev --audit-level=high`.

The production database must be backed up according to the Supabase project’s operational policy before schema reconciliation. A rollback rehearsal should cover application deployment rollback, migration compatibility, GitHub write credentials, and webhook/repository configuration. A release is not complete until the deployment URL, commit SHA, migration state, and rollback owner are recorded.

## Completed implementation areas

The registry-first stream model, generated registry, eager stream trees, raw delivery, browser sessions, themes, tree accessibility, reader controls, Community/Issues foundations, GitHub review paths, protected Blob flow, SVG normalization, Markdown figure fences, Mermaid strict mode, service-worker versioning, and local/full automated validation are implemented in the repository. Their detailed responsibilities are documented in [`docs/phase1/REAL-ARCHITECTURE.md`](phase1/REAL-ARCHITECTURE.md) and [`docs/MARKDOWN-RENDERER.md`](MARKDOWN-RENDERER.md).

## Post-v1.0.0 roadmap

After release, prioritize structured observability and retention, formal privacy/account lifecycle policy, deeper browser accessibility/mobile testing, richer frontmatter-driven note presentation, maintained SMILES rendering, and a separate reviewed worker for true vector tracing. The current raster path must remain clearly labelled as an embedded-raster SVG container.

## Documentation policy

This register supersedes older phase checklists when they disagree with the current source. Historical reports remain useful for decisions and regressions, but active behavior is defined by the code, the README, the current architecture map, and the release gates above.
