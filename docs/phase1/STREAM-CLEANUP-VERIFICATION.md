# Stream Cleanup Verification

## Result

The staged cleanup was executed against the current configuration. The application now distinguishes `science`, `commerce`, and `humanities` as **streams** while preserving genuine academic-subject fields used by community, moderation, editor, and submission workflows.

## Completed phases

| Phase | Result | Verification |
|---|---|---|
| Terminology audit | Completed | Stream-facing references were classified separately from academic-subject references. |
| Stream rename | Completed | `subjects.html` → `streams.html`; `subjects.ts` → `streams.ts`; `subjects.css` → `streams.css`; compiled asset → `streams.js`. |
| Stream artifact wiring | Completed | Explicit mapping resolves Science, Commerce, and Humanities to their matching `public/json/<stream>-tree.json` files. |
| Local landing documents | Completed | Landing page reads local `files.json` and exposes `README.md` plus `docs/archive/ARCHITECTURE.md`. |
| Settings | Completed | `/settings` route and page added; sign-in is intentionally deferred; theme controls use existing local preference runtime. |
| Darker theme | Completed | Default dark tokens and futuristic runtime preset were moved to darker surfaces and borders; explicit light/contrast presets remain available. |
| Cleanup and verification | Completed | Temporary smoke script removed; canonical renamed assets are present; stale active stream-as-subject references are absent. |

## Canonical stream wiring

The active browser and server use the following contract:

```text
/science       → /api/system/science       → /public/json/science-tree.json
/commerce     → /api/system/commerce      → /public/json/commerce-tree.json
/humanities   → /api/system/humanities    → /public/json/humanities-tree.json
```

Each generated tree now carries a `stream` field and retains its named root (`NoteBooks-Science`, `NoteBooks-Commerce`, or `NoteBooks-Humanities`). File nodes retain their exact source paths and precomputed raw URLs.

## Preserved subject-domain boundaries

The cleanup intentionally did not rename `community_posts.subject`, community request fields, editor/PR subject fields, or subject-specific submission helpers. These are retained because they belong to future write and academic-subject workflows rather than the top-level stream browser.

The runtime stream API still accepts `subject` as a legacy query/parameter alias for controlled compatibility, but its public route is `/api/system/:stream`, its payload field is `stream`, and its cache/header/error terminology is stream-based.

## Verification evidence

The final production build completed successfully. The final test suite completed with **24 test files passed and 66 tests passed**. Runtime smoke checks passed for the Settings route, stream shell route, canonical registry, all three stream artifacts, all three `/api/system/:stream` responses, local `files.json`, and the raw endpoint.

The generated-artifact step continues to report the known external Commerce freshness issue: `fsr-commerce/NCERT-Commerce` returns `404 Not Found` for its root `files.json`. The generator retains the last valid Commerce snapshot rather than replacing it with an empty tree.

## Files removed or renamed

The stream-facing files removed from their former names are `public/html/subjects.html`, `src/client/subjects.ts`, `public/css/subjects.css`, and the generated `public/client/subjects.js`. Their canonical replacements are `public/html/streams.html`, `src/client/streams.ts`, `public/css/streams.css`, and `public/client/streams.js`.

The temporary `scripts/verify-next-cleanup.mjs` smoke-test helper was removed after verification. Its evidence was retained outside the project tree.
