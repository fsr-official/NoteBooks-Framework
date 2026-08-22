# Stream Terminology and Route Audit

## Scope rule

`science`, `commerce`, and `humanities` are **top-level streams**. Academic subjects such as Physics, Chemistry, Biology, Economics, and History are separate concepts and must not be renamed.

## Current stream-facing terminology requiring migration

| Current usage | Stream interpretation | Planned treatment |
|---|---|---|
| `src/client/subjects.ts` | Client controller for science/commerce/humanities workspace trees | Rename stream-facing controller terminology to `streams` while preserving compatibility exports during transition. |
| `public/client/subjects.js` | Compiled stream workspace controller | Regenerate from renamed source. |
| `subjectSlug`, `subjectPayload`, `subjectTreeManifest` in `public/js/app.js` | Top-level stream slug and stream tree payload | Rename to `streamSlug`, `streamPayload`, and `streamTreeManifest`. |
| `subjectContentRoot`, `subjectLanding`, `subjectGrid`, `.subject-card` in `index.html` and styles | Landing page collection of top-level streams | Rename to `streamContentRoot`, `streamLanding`, `streamGrid`, and `.stream-card`. |
| `subject.html` references, if present in future/deployment aliases | Top-level stream shell | Use `streams.html` as the canonical name; retain an explicit compatibility route only if a live reference requires it. |
| `/api/subject/:subject/...` | Mixed-purpose future write/community routes | Do not blindly rename in this phase; classify separately because write APIs store academic/community `subject` fields. |

## Current subject terminology to preserve

| Current usage | Why it stays |
|---|---|
| `community_posts.subject` and community request fields | Database and community metadata may refer to an academic subject or discussion category. |
| `subject` in editor, PR, moderation, and community flows | These future write features are retained and must not be semantically changed while the read browser is being renamed. |
| Academic subject names in content and documentation | Physics and similar subjects are not top-level streams. |
| Generic Markdown/content labels that describe a subject | These are not necessarily the stream browser and require local context before changing. |

## Current active wiring

The current browser has two relevant paths. The stream workspace loader uses the runtime system endpoint first and then `public/json/<slug>-tree.json`. The primary app still carries `subject` variable names and landing-page IDs/classes, even though the values `science`, `commerce`, and `humanities` are top-level streams. The canonical generated artifacts are already under `public/json/` and must remain the source of truth.

The current runtime subject API now serves the generated stream artifact when available, but its function and parameter names still use `subject`. The `/api/registry` endpoint serves the canonical generated complete registry. The raw file path remains `/api/raw`.

## Phase-I audit conclusion

The rename can be performed safely in the frontend and read-only stream API boundary, but not as a global replacement. Community, moderation, editor, PR, and database fields using `subject` must remain untouched unless a later domain-specific migration proves they refer to streams rather than academic subjects.
