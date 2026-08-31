> **Document status:** historical implementation record. For current behavior, use [`docs/README.md`](../../README.md), the root [`README.md`](../../../README.md), and the active architecture/release documents.
>
# Phase 3 — Community and issue system rollout

Skeleton and checklist for Phase 3 work items.

- [x] `community_posts` table and endpoints
- [x] Moderation endpoints and RBAC
- [x] GitHub App helpers for discussion and PR creation
- [ ] Moderation UI and audit trails
- [ ] Integration tests for community flows

Implementation notes:
- Community API: `src/api/community.ts`.
- GitHub App helpers: `src/lib/github-app.ts`.
