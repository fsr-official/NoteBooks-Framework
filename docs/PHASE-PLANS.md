# NoteBooks Delivery and Release Plan

**Status:** active plan for the `whoami` staging branch and eventual v1.0.0 release.

This plan reflects the current architecture rather than the older subject/forum design. The public content layer remains read-oriented and eager, while account-bearing Community, Issues, admin, upload, and GitHub write paths are protected separately.

## Completed foundations

| Area | Current state |
| --- | --- |
| Registry and stream model | `GITHUB-REPOSITORIES.md` is decomposed into `public/json/github-repos.json`; Science, Commerce, and Humanities have eager tree artifacts; Community and Issues remain registry workspaces. |
| Raw delivery | `src/api/raw.ts` is the canonical file-byte path with repository/path validation and local path constraints. |
| Browser reliability | Home restoration, tree readability/keyboard navigation, theme persistence, reader controls, cache versioning, and service-worker behavior have been improved. |
| Identity and sessions | JWT/OAuth/TOTP foundations and opaque `nb_sid` browser sessions exist, with PostgreSQL persistence and explicit local fallbacks. |
| Community and Issues | Channels, presence/profile foundations, source-linked proposals, evidence capture, review, and GitHub lifecycle handlers exist. |
| Markdown renderer | Markdown-it/Obsidian features, MathJax, Mermaid, TikZ, Desmos, highlighting, callouts, figure fences, and accessible note styling are documented and tested. |
| Diagram assets | Biology and chemistry starter SVGs are stored with licenses; upload normalization supports native sanitized SVG and explicitly labelled embedded-raster SVG output. |

## Release phase A — Reconcile production configuration

The first release task is configuration, not new product scope. Link the Vercel project to `fsr-official/NoteBooks-Framework` rather than the currently observed unrelated `hsxtheemperor/NoteBooks-Science-Framework` Next.js project. Configure the server’s actual environment variable names in Vercel, set the correct Node/build behavior, and deploy the `whoami` commit to a preview before production promotion.

The Supabase project is active and has the expected broad application table set, but its migration history is behind the local repository’s migration set. Reconcile migrations using a reviewed staging path. The Supabase advisor currently reports sixteen tables with RLS disabled and also reports RLS-enabled tables with no policies. Do not apply a blanket `ENABLE ROW LEVEL SECURITY` statement: each table requires intentional policies for the server’s service-role/connection model, and policy testing must occur before release.

## Release phase B — Exercise protected flows

Complete administrator identity linking and TOTP enrollment. Test login, session cookie behavior, theme persistence, raw reads, source evidence, Community posting/moderation, Issues proposal/review, GitHub PR operations, Blob upload/review, and diagram conversion with staging repositories and reversible records. Confirm that missing credentials fail closed for the associated capability and do not leak secrets.

## Release phase C — Browser and operational validation

Validate Home → stream → Home restoration, stream tree expansion/collapse, raw line-number view, Markdown figures, MathJax/Mermaid/TikZ fallback states, Settings controls, mobile layout, keyboard focus, and service-worker update behavior in a real browser. Measure initial shell response and tree-render timing on the intended deployment. Exercise refresh invalidation and confirm that stale fallback artifacts are visible only as resilience behavior, not as a silent repository substitution.

## Release phase D — Tag and promote

When the previous phases pass, record the verified commit SHA and preview URL, run the final automated checks, tag `v1.0.0`, and promote the same commit. Keep `whoami` as the staging line until the production deployment is confirmed. Rollback means promoting the last known-good deployment and reverting only the relevant database/application change according to the migration policy.

## Future phases after v1.0.0

The following are intentionally outside the first release gate: a separate worker for true Potrace/OpenCV vector tracing; richer frontmatter-driven note metadata and generated outlines; maintained SMILES rendering after dependency/license review; stronger structured monitoring and log retention; expanded governance policy; and additional volunteer workflow automation. Raster-in-SVG packaging must not be described as true vectorization.

## Working rules

Every behavior change must update the nearest active documentation and tests. Generated JSON is changed through the registry/generator workflow. Stream pages must not be renamed to subjects, Community and Issues must not be put into content trees, raw delivery must remain dominant, and no credentials or private deployment values may be committed.
