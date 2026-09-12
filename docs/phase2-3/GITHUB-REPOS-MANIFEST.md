> **Document status:** historical implementation record. For current behavior, use [`docs/README.md`](../../README.md), the root [`README.md`](../../../README.md), and the active architecture/release documents.
>
# Build-Time GitHub Repository Manifest

**Status:** implemented and locally verified  
**Canonical source:** `GITHUB-REPOSITORIES.md`  
**Generated artifact:** `public/json/github-repos.json`

## Purpose

`GITHUB-REPOSITORIES.md` remains the human-maintained source of repository configuration. It is now decomposed once during the build into `public/json/github-repos.json`. Runtime consumers use the generated artifact first, which removes repeated Markdown parsing from request and startup paths while preserving the Markdown file as the reviewable source of truth.

The build command runs the steps in this order:

```text
fmtree.py
→ generate-version.js
→ generate-github-repos.ts
→ generate-json-files.ts
→ build:client
→ build:server
```

Development startup also regenerates the repository artifact before refreshing the stream trees. Production startup does not perform remote generation; it validates that the generated artifact and stream trees are present in the deployment.

## Artifact schema

The artifact is intentionally deterministic for a given source file. It does not contain a generation timestamp. Its `sourceSha256` value makes the relationship to the exact Markdown bytes visible and allows CI or future diagnostics to detect stale output.

```json
{
  "schemaVersion": 1,
  "sourceFile": "GITHUB-REPOSITORIES.md",
  "sourceSha256": "<sha256 of the exact source bytes>",
  "entries": [
    {
      "name": "NCERT-SCIENCE",
      "stream": "science",
      "repo": "fsr-science/NCERT-Science",
      "branch": "main",
      "root": "",
      "enabled": true,
      "priority": 1,
      "pages": true,
      "empty": false
    }
  ]
}
```

The parser preserves the existing columns and semantics: `name`, case-insensitive `stream`, `repo`, `branch`, `root`, `enabled`, numeric `priority`, `pages`, and optional `empty`. Empty or malformed source tables fail generation instead of silently writing an empty artifact. The canonical source now includes `COMMUNITY` mapped to `fsr-official/NoteBooks-Community` and `ISSUES` mapped to `fsr-official/NoteBooks-Issues`; these are workspace routing entries, not content streams indexed into stream trees. Commerce is explicitly marked `empty=true` because its repository intentionally has no files manifest.

## Runtime ownership

The canonical parser and artifact builder live in `src/lib/github-repositories.ts`. `src/scripts/generate-github-repos.ts` reads the Markdown source and writes the artifact atomically. `src/api/repo-registry.ts` and `src/api/_shared.ts` both prefer the artifact and retain Markdown/legacy JSON readers only as compatibility fallbacks for incomplete local checkouts or older deployments.

`generate-json-files.ts` continues to own remote `files.json` retrieval and content stream-tree construction. It ignores non-content workspace entries such as `COMMUNITY` and `ISSUES` for tree generation. Entries marked `empty=true` produce valid empty repository trees without a remote request; this is the intended Commerce path. Runtime Community and Issues handlers use `getStreamRepo('community')` and `getStreamRepo('issues')` from the same artifact, with `GITHUB_COMMUNITY_REPO` and `GITHUB_ISSUES_REPO` retained only as compatibility fallbacks for older deployments. Repository credentials remain separate server-side secrets (`GITHUB_PAT`, `GITHUB_TOKEN`, or GitHub App credentials).

The artifact is included in the service-worker application shell. The current cache release is `webman-v25`, which also invalidates clients holding the previous shell while delivering the Home navigation restoration.

## Verification

The focused frontend, Commerce-empty, and registry-routing regressions pass, and the complete suite passes: **32 test files and 93 tests**. Typecheck, the full build, JavaScript syntax checks, and the build-time generator pass. The current generated artifact contains five entries: Science, Commerce, Humanities, Community, and Issues. Its source SHA-256 is regenerated from the current Markdown source during each build. A local CDP browser check also verified Home → Science → Home with no console exceptions; the returned Home state restored the landing markup and made `#streamLanding` visible.
