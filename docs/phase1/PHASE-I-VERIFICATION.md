# Phase-I Verification and Cleanup Report

## Status

Phase I is **implemented and structurally verified**, with one external content warning: `fsr-commerce/NCERT-Commerce` returned `404 Not Found` for its repository-root `files.json`. The generator retained the collaborator-provided commerce snapshot as stale data instead of overwriting it with an empty tree.

## Implemented canonical path

```text
GITHUB-REPOSITORIES.md
  -> src/api/repo-registry.ts
  -> src/scripts/json-fetch.ts
  -> src/scripts/generate-json-files.ts
  -> public/json/repo-registry.json
  -> public/json/<stream>-tree.json
  -> browser workspace
  -> /api/raw
  -> raw.githubusercontent.com
```

The generator now runs from the build pipeline and before the compiled Node server begins listening. It writes only the canonical artifacts under `public/json/`. Stream trees use `NoteBooks-Science`, `NoteBooks-Commerce`, and `NoteBooks-Humanities` roots. File nodes retain repository-relative paths and include precomputed raw URLs.

## Collaborator changes integrated

The collaborator archive’s administrator-security upgrades were integrated without coupling them to Phase-I content browsing. These include authenticated TOTP routes, GitHub-link OAuth flow, linked-GitHub-plus-TOTP administrator security, stricter admin/moderation/PR-review protection, administrator security UI, service-worker cache version `webman-v10`, and associated tests.

The collaborator archive did not contain `generate-json-files.ts` or `json-fetch.ts`; those were created as part of this Phase-I implementation.

## Cleanup completed

The following duplicate or superseded Phase-I files were removed after reference and build checks:

| Removed | Reason |
|---|---|
| `src/scripts/generate-registry.ts` | Superseded by the canonical generator. |
| `src/scripts/generate-subject-trees.ts` | Superseded by stream generation in the canonical generator. |
| `scripts/generate-stream-trees.js` | Superseded by the canonical generator. |
| Root `repo-registry.json` | Duplicate of the canonical `public/json/repo-registry.json`. |
| `public/repo-registry.json` | Duplicate registry artifact. |
| `public/science-tree.json` | Duplicate stream artifact. |
| `public/commerce-tree.json` | Duplicate stream artifact. |
| `public/humanities-tree.json` | Duplicate stream artifact. |

The existing authentication, OAuth, TOTP, editor/PR, community, moderation, forum, admin, GitHub App, webhook, upload, offline, and raw fallback modules were retained as requested.

## Verification evidence

| Check | Result |
|---|---|
| Server typecheck | Passed. |
| Client compilation | Passed. |
| Full production build after cleanup | Passed. |
| Generated JSON contract verification | Passed: canonical registry root, three stream roots, stream presence, exact paths, and raw URL metadata. |
| Full test suite after cleanup | Passed: 24 test files, 66 tests. |
| `npm start` smoke test | Passed: startup generation completed and server listened on port 4000; process was intentionally terminated by the timeout harness. |
| Repository manifest freshness | Partial: Science and Humanities fetched; Commerce returned 404 and used stale snapshot. |

## Remaining flags

The commerce repository’s root `files.json` must be restored, moved, or corrected in `GITHUB-REPOSITORIES.md` before the commerce snapshot can be considered fresh. The application currently logs this condition and serves the last valid generated tree.

The legacy dynamic registry builder remains in `src/api/repo-registry.ts` because it is still used by compatibility paths and repository lookup helpers. It is no longer the primary `/api/registry` response when `public/json/repo-registry.json` exists. It should be removed only after the remaining dormant consumers are intentionally retired.

The active service-worker source under `service-worker.js` contains the collaborator’s admin-route freshness protection. The separate `src/service-worker.ts` remains an older, not-currently-built source variant and should be handled in a later dedicated PWA cleanup rather than deleted implicitly in Phase I.

## Final runtime verification

After the cleanup pass, the final build and test run completed successfully. The compiled server smoke test confirmed that startup generation runs before listening, `/api/registry` returns a recursive `root` registry with three stream entries, and `/api/system/science` returns the canonical `NoteBooks-Science` root. The health endpoint correctly reported a degraded state because this inspection environment has no `DATABASE_URL` and no GitHub authentication credentials; this did not prevent public generated-artifact serving.

The final automated result was **24 test files passed and 66 tests passed**. The full build completed successfully, including cleanup, version generation, JSON generation, client compilation, and server compilation.

The only remaining content issue is external: the configured Commerce repository returns `404 Not Found` for its root `files.json`. The generator logs that failure and preserves the last valid Commerce snapshot rather than replacing it with an empty tree. The Commerce repository or its registry configuration should be corrected before treating that stream as fresh.
