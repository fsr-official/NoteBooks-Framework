# System overview

## Purpose

NoteBooks is a repository-backed learning platform that presents curriculum material as a set of stream workspaces and exposes a small set of community, issues, and admin surfaces around them.

## Architectural boundaries

- Browser shell: static HTML and vanilla JavaScript served by Express
- Runtime API: stream discovery, raw file delivery, session management, and authenticated features
- Data sources: GitHub repositories, Pages manifests, generated JSON artifacts, and local repo manifests
- Persistence: PostgreSQL or a safe volatile fallback for app state; GitHub for content and review automation

## Runtime composition

1. A page loads the shared shell and route-specific client scripts.
2. The stream shell resolves the current stream slug such as science, commerce, humanities, or developers.
3. The application requests the canonical artifact at /public/json/<stream>-tree.json, with /api/system/<stream> as the runtime fallback.
4. The browser renders the repository tree and opens files through the raw delivery pipeline.
5. Community, issues, and admin pages use dedicated endpoints instead of being mixed into the content tree flow.

## Invariants

- Stream artifacts are generated eagerly during build and startup.
- Generated JSON is the canonical offline and deployment fallback.
- The runtime system API remains authoritative for freshness when the generated artifact is absent or stale.
- The Developers stream is pinned to this repository itself and is not treated like a remote GitHub subject repository.
