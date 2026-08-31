> **Document status:** historical implementation record. For current behavior, use [`docs/README.md`](../../README.md), the root [`README.md`](../../../README.md), and the active architecture/release documents.
>
# Phase 1 — File Service stabilization

Skeleton and checklist for Phase 1 work items.

- [x] Raw CDN-first file retrieval
- [x] `files.json` schema standardization
- [x] Last-known-good manifest and cache headers
- [ ] Performance regression tests
- [ ] Add health checks for refresh pipeline

Implementation notes:
- The public file service code lives under `public/` and `src/client` and `src/service-worker.ts`.
- Keep read-only behavior enforced by config flags; do not wire write credentials into the public layer.
