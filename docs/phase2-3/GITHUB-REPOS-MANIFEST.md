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
      "pages": true
    }
  ]
}
```

The parser preserves the existing columns and semantics: `name`, case-insensitive `stream`, `repo`, `branch`, `root`, `enabled`, numeric `priority`, and `pages`. Empty or malformed source tables fail generation instead of silently writing an empty artifact.

## Runtime ownership

The canonical parser and artifact builder live in `src/lib/github-repositories.ts`. `src/scripts/generate-github-repos.ts` reads the Markdown source and writes the artifact atomically. `src/api/repo-registry.ts` and `src/api/_shared.ts` both prefer the artifact and retain Markdown/legacy JSON readers only as compatibility fallbacks for incomplete local checkouts or older deployments.

`generate-json-files.ts` continues to own remote `files.json` retrieval and stream-tree construction. It receives normalized entries from `loadRepoRegistry()` and therefore does not need to know whether the entries came from the artifact or a compatibility fallback.

The artifact is included in the service-worker application shell. The current cache release is `webman-v23`.

## Verification

The focused artifact and stream-routing tests pass: **3 test files and 7 tests** in the focused run. The complete suite passes: **31 test files and 90 tests**. Typecheck, the full build, JavaScript syntax checks, and the build-time generator pass. The current generated artifact contains three entries for Science, Commerce, and Humanities, with source SHA-256 `97e0a89dd3d8f64b799f9c4188574f397eba77359c699d434fd06121cfc921f3` for the current Markdown source.
