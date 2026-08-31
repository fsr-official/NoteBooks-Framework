> **Document status:** historical implementation record. For current behavior, use [`docs/README.md`](../../README.md), the root [`README.md`](../../../README.md), and the active architecture/release documents.
>
# Phase 4 — Volunteer and admin submission pipeline

Skeleton and checklist for Phase 4 work items.

- [ ] PR-based contribution intake
- [ ] Admin review and merge rights
- [ ] Persist PR metadata in DB (implemented)
- [ ] Installation webhook handler and persistent installation records (implemented)
- [ ] Safety checks for auto-merge and required CI checks

Implementation notes:
- PR metadata columns added to `community_posts` in `src/db/init_identity_schema.sql`.
- Webhook handler: `src/api/webhooks/github-app.ts`.
