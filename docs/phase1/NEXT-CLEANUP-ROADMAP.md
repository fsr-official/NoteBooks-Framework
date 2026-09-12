> **Document status:** historical implementation record. For current behavior, use [`docs/README.md`](../../README.md), the root [`README.md`](../../../README.md), and the active architecture/release documents.
>
# Next Cleanup Roadmap

## Guiding rule

The application uses **streams** as top-level content collections: `science`, `commerce`, and `humanities`. These are not academic subjects. Academic subjects such as Physics, Chemistry, Biology, Economics, or History must remain subjects and must not be renamed by this cleanup.

The cleanup will proceed one phase at a time. Each phase will produce a working build and a focused verification result before the next phase changes the codebase.

## Phase 1 — Audit and map the current terminology and wiring

Inventory every HTML page, client controller, server route, generated artifact, URL, CSS selector, test, and documentation reference that uses `subject` for the top-level `science`, `commerce`, or `humanities` experience. Classify each occurrence as either a stream concept or an academic-subject concept.

At the same time, map the current page topology: landing page, `streams.html`, any existing `subject.html` shell, stream-specific pages, generated `public/json/*-tree.json` artifacts, local `files.json`, and server endpoints. No renaming occurs until this classification is recorded.

**Verification gate:** produce a terminology matrix and route map; confirm that Physics-like academic subjects are excluded from stream renaming.

## Phase 2 — Rename stream-facing concepts only

Rename stream-facing names from `subject` to `stream` in filenames, variables, functions, route parameters, page titles, comments, and documentation wherever they refer to the top-level stream browser. The expected direction is `streams.html`, `stream.ts`/`streams.ts` naming where appropriate, stream routes, and stream JSON terminology.

Do not rename academic subject data, subject-specific content, Physics or other academic subject pages, or generic content nodes that genuinely represent subjects. If an old filename must remain temporarily for compatibility, make the compatibility redirect explicit and mark it for later removal.

**Verification gate:** repository-wide search confirms that remaining `subject` references are either academic-subject references or documented compatibility boundaries; client compilation, server typecheck, and relevant page tests pass.

## Phase 3 — Wire `streams.html` to the correct generated JSON

Make every stream instance created from `streams.html` resolve its stream slug through one canonical mapping:

| Stream | Canonical artifact |
|---|---|
| Science | `/public/json/science-tree.json` |
| Commerce | `/public/json/commerce-tree.json` |
| Humanities | `/public/json/humanities-tree.json` |

The page must not guess based on display labels, fall back to another stream’s tree, or route a stream through an academic-subject endpoint. The stream payload must retain the root names `NoteBooks-Science`, `NoteBooks-Commerce`, and `NoteBooks-Humanities`.

The runtime API and static fallback, if retained, must return the same payload contract. File clicks must continue through `/api/raw` using the generated node metadata.

**Verification gate:** test all three stream cards/instances, assert the requested artifact and payload root, and verify that a missing stream cannot silently resolve to another stream.

## Phase 4 — Use local `files.json` for landing-page documentation

The landing page will read the project’s local `files.json` for relevant project documentation, especially `README.md` and `ARCHITECTURE.md`. The page should present these as local project information rather than attempting to fetch them from a stream repository.

The implementation will define a small allowlist of relevant landing documents, preserve their local paths, and provide a clear empty/error state when a file is absent. This local-document path is separate from stream browsing and separate from `/api/raw` repository delivery.

**Verification gate:** stub or fixture the local `files.json`, confirm `README.md` and `ARCHITECTURE.md` appear on the landing page, confirm no stream JSON is used for these cards, and verify missing documents fail visibly.

## Phase 5 — Build the Settings page with deferred sign-in

Add a dedicated Settings page and navigation entry. Phase I of Settings is a stable UI shell, not a complete account system. It should provide placeholders for sign-in/account state, theme preferences, and future user settings without requiring authentication now.

The design must define a future integration boundary so later sign-in can attach to the existing authentication system without coupling theme preferences to admin security, community, or editor flows. Theme preference storage should use a safe local preference mechanism first, with a clear path to server-backed preferences later.

**Verification gate:** unauthenticated users can open Settings, sign-in controls are explicitly marked as deferred or non-functional, theme controls do not modify authentication state, and the page works offline where the current PWA shell supports it.

## Phase 6 — Apply the darker theme

Make the active application theme darker through centralized color tokens and shared shell styles rather than scattered one-off overrides. Check the landing page, streams page, stream workspace, Settings page, admin shell, modal windows, cards, code/Markdown preview, forms, focus states, and offline page.

Preserve readable contrast, link visibility, keyboard focus, disabled states, error/success messages, and PDF/Markdown preview usability. Do not make the theme change depend on sign-in.

**Verification gate:** visual review of every active shell plus automated checks for required theme tokens and page stylesheet loading; confirm no light-background regressions in primary surfaces.

## Phase 7 — Final regression and cleanup review

Run repository-wide terminology scans, route/artifact consistency checks, client and server builds, the full test suite, and startup/runtime smoke tests. Review generated files and ensure only the canonical stream artifacts remain active.

Remove files only when they are proven obsolete by import/reference scans and no longer belong to a retained compatibility boundary. Preserve dormant future-feature modules unless a separate removal decision exists.

**Verification gate:** produce a final change manifest listing renamed files, compatibility redirects, retained academic-subject references, removed files, deferred files, test results, and any external content warnings.

## Execution discipline

Only one phase will be modified at a time. A failed phase will be corrected before the next phase begins. Collaborator upgrades will be compared before merging, and any change that affects stream terminology, generated-artifact contracts, authentication boundaries, or theme behavior will be flagged explicitly.
