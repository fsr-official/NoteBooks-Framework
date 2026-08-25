> **Document status:** historical implementation record. For current behavior, use [`docs/README.md`](../../README.md), the root [`README.md`](../../../README.md), and the active architecture/release documents.
>
# Phase 2 — Shared identity and session foundation

Skeleton and checklist for Phase 2 work items.

- [x] Postgres identity schema and `users` table
- [x] Local auth, JWT sessions, TOTP
- [x] GitHub OAuth
- [x] CSRF protections and cookie hardening
- [ ] Session persistence with Redis (optional)
- [ ] Audit logging for write paths

Implementation notes:
- Identity code: `src/lib/db.ts`, `src/api/auth.ts`, `src/api/totp.ts`, `src/lib/permissions.ts`.
