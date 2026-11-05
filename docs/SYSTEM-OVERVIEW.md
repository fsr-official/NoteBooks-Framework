# System overview

## Purpose

NoteBooks is a repository-backed learning platform that presents curriculum material as a set of stream workspaces and exposes a small set of community, issues, and admin surfaces around them.

## Architectural boundaries

- Browser shell: static HTML and vanilla JavaScript served by Express
- Runtime API: stream discovery, raw file delivery, session management, and authenticated features
- Data sources: GitHub repositories, the NoteBooks-Documents registry, generated JSON bootstrap artifacts, and local repo manifests
- Persistence: Upstash Redis for the active repo registry, processed commit SHAs, and content catalog; PostgreSQL for identity and other durable app state; GitHub for source content

## Runtime composition

1. A page loads the shared shell and route-specific client scripts.
2. The stream shell resolves the current stream slug such as science, commerce, humanities, or developers.
3. The application requests `/api/system/<stream>` and falls back to `/public/json/<stream>-tree.json` when runtime configuration is not active.
4. The browser renders the repository tree and opens files through the raw delivery pipeline.
5. Repository workflows POST signed commit notifications. The app fetches the configured registry or `files.json` at an immutable commit SHA, diffs Git blob SHAs, updates the shared catalog, and invalidates only affected stream trees.
6. Clients poll the catalog without navigating away. An open changed file remains unchanged until the reader explicitly applies the new revision.
7. Community, issues, and admin pages use dedicated endpoints instead of being mixed into the content tree flow.

## Invariants

- Stream artifacts are generated during build as bootstrap/offline fallbacks.
- The runtime Redis registry and catalog are authoritative after activation; update notifications never write generated files or trigger application deployments.
- Content updates require a signed workflow POST, registered repo/branch validation, and valid per-file blob SHAs.
- No-change commits advance the processed SHA without invalidating content caches or notifying readers.
- The Developers stream is pinned to this repository itself and is not treated like a remote GitHub subject repository.
