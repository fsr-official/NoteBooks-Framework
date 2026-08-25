# NoteBooks Documentation Index

This directory contains the active technical documentation and historical decision records for NoteBooks Framework. The root [`README.md`](../README.md) is the release-facing overview and environment matrix. The documents below are the maintained references for the current implementation.

| Document | Use it for | Authority |
| --- | --- | --- |
| [`DEVELOPER-ONBOARDING.md`](DEVELOPER-ONBOARDING.md) | Local setup, safe change workflow, file ownership, and contributor rules. | Active. |
| [`phase1/REAL-ARCHITECTURE.md`](phase1/REAL-ARCHITECTURE.md) | Current Express, browser, registry, raw delivery, persistence, security, and integration architecture. | Active source of truth. |
| [`MARKDOWN-RENDERER.md`](MARKDOWN-RENDERER.md) | Markdown syntax, rendering lifecycle, file responsibilities, figure fences, and renderer security. | Active source of truth. |
| [`PHASE-PLANS.md`](PHASE-PLANS.md) | Delivery sequence, release gates, staging branch, and post-v1.0.0 roadmap. | Active plan. |
| [`REMAINING.md`](REMAINING.md) | Production blockers and required release verification. | Active release register. |
| [`phase2-3/DIAGRAM-ASSET-AND-RENDERER-PLAN.md`](phase2-3/DIAGRAM-ASSET-AND-RENDERER-PLAN.md) | SVG assets, conversion modes, licensing, and future vector tracing. | Active feature plan. |
| [`phase2-3/FINAL-RELEASE-AUDIT-2026-08-25.md`](phase2-3/FINAL-RELEASE-AUDIT-2026-08-25.md) | Final GitHub, Vercel, Supabase, environment, security, and automated validation findings. | Active release audit. |
| [`phase2-3/FINAL-AUDIT-AND-VERIFICATION.md`](phase2-3/FINAL-AUDIT-AND-VERIFICATION.md) | Prior audit evidence and verification history. | Historical evidence; reconcile with current audit results. |
| [`phase2-3/ENVIRONMENT-AND-REMAINING-GAPS.md`](phase2-3/ENVIRONMENT-AND-REMAINING-GAPS.md) | Earlier deployment/configuration findings. | Historical evidence; current variables are in the root README. |
| `phase1/*.md`, `phase2-3/*.md`, `phases/*.md` | Detailed phase decisions, migration notes, and historical implementation records. | Historical unless explicitly marked active above. |

## Documentation rules

Behavioral claims must match the current code and route composition. When a change makes a document stale, update the nearest active reference in the same change and label older reports as historical snapshots. Do not document credentials, private deployment URLs, raw session tokens, or hidden workspace information. Generated JSON artifacts are described by their generator and must not be treated as hand-maintained configuration.
