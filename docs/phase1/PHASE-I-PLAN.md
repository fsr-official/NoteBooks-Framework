# Phase-I Setup, Collaborator Integration, and Verified Cleanup Plan

## Objective

Make Phase I a stable, read-only, registry-driven content browser. The application should generate its repository registry and stream trees from repository-root `files.json` manifests, preserve exact source paths, store precomputed raw URLs, and use `raw.ts` as the dominant file-delivery path.

Existing authentication, OAuth, TOTP, editor/PR, community, moderation, uploads, admin, forum, GitHub App, refresh, and offline modules are **not removed merely because they are outside Phase I**. They remain dormant or isolated unless they are proven obsolete after the Phase-I read path is complete.

## Collaborator archive findings

The newly supplied archive contains functional changes to administrator security and routing, but it does not add the expected `generate-json-files.ts` or `json-fetch.ts` modules. The upgrade archive modifies the following areas:

| Collaborator change | Classification | Phase-I treatment |
|---|---|---|
| Adds `/api/totp` and `/api/totp.js` POST routes | Compatible but outside read-path scope | Preserve and integrate without making it part of the content-browser flow. |
| Adds authenticated GitHub-link URL/callback behavior to `/api/oauth` | Compatible but requires security review | Preserve; verify callback/state behavior separately from Phase-I. |
| Adds `getAdminSecurityContext` and `requireAdminSecurity` | Compatible behavior change | Preserve as an admin-security upgrade; do not let it affect public subject browsing. |
| Changes admin, moderation, GitHub App, webhook-admin, and PR-review routes to require linked GitHub plus TOTP | Behaviorally significant | Flag for explicit regression verification because existing admin access now becomes stricter. |
| Adds administrator security-enrollment UI to `admin-prs.html` | Compatible UI addition | Preserve, provided the new `/api/oauth` and `/api/totp` routes are available. |
| Changes service-worker cache from `webman-v9` to `webman-v10` and forces admin routes to network | Compatible | Preserve; it improves route freshness and prevents cached admin shells. |
| Adds/updates tests for TOTP, OAuth linking, admin security, and route protection | Compatible and valuable | Merge into the verification suite; resolve any assumptions about in-memory users or environment state. |
| Changes `vercel.json` with admin redirects | Potential routing overlap | Verify against Express admin-shell routes before accepting as canonical. |

No collaborator change directly conflicts with the requested registry → stream-tree → raw-file read architecture. The security upgrades should therefore be retained, but they must be separately verified and clearly marked as outside Phase-I’s functional scope.

## Canonical Phase-I data flow

```text
GITHUB-REPOSITORIES.md
        |
        v
repo-registry.ts / registry loader
        |
        v
json-fetch.ts
  fetch root files.json for every enabled configured repository
        |
        +----------------------------------+
        |                                  |
        v                                  v
public/json/repo-registry.json       public/json/<stream>-tree.json
complete repository scope            one stream only
        |                                  |
        +----------------+-----------------+
                         |
                         v
                 browser repository tree
                         |
                         v
                      raw.ts
                         |
                         v
       raw.githubusercontent.com/<repo>/<branch>/<path>
```

## Canonical generated artifacts

### Complete registry

`public/json/repo-registry.json` will contain the complete configured scope. It will represent each enabled registry entry with its stream, repository, branch, configured root, and the exact root `files.json` data fetched for that repository. Every file node will include a precomputed raw URL.

The implementation should preserve the current recursive tree compatibility shape where possible:

```json
{
  "type": "folder",
  "name": "root",
  "children": [
    {
      "type": "folder",
      "name": "science",
      "stream": "science",
      "children": [
        {
          "type": "folder",
          "name": "NCERT-Science",
          "repo": "owner/NCERT-Science",
          "branch": "main",
          "children": []
        }
      ]
    }
  ]
}
```

If the fetched source manifest already provides a compatible tree, its node fields should be retained rather than unnecessarily transformed. The authoritative rules are that the full registry includes all enabled repositories, stream and repository metadata is retained, source paths are preserved, and file nodes contain raw URLs.

### Stream-scoped trees

The generator will create:

| File | Contents | Root name |
|---|---|---|
| `public/json/science-tree.json` | Science repositories only | `NoteBooks-Science` |
| `public/json/commerce-tree.json` | Commerce repositories only | `NoteBooks-Commerce` |
| `public/json/humanities-tree.json` | Humanities repositories only | `NoteBooks-Humanities` |

Repositories will appear as folders below the stream root. The nested content and file paths will be copied from each repository’s root `files.json` without changing repository-relative paths. The raw URL will be stored on each file node.

The exact final wrapper should be selected before implementation. The preferred compatibility form is `{ subject, root, repos }`, where `root` is the stream-root tree and `repos` retains repository metadata, because this supports both the current subject client and the requested root naming.

## Implementation sequence

### 1. Re-baseline and compare

Keep the original project extraction untouched as the baseline. Keep the collaborator extraction isolated. Produce a file-level and functional diff before copying any changes. Record every difference as merged, deferred, or conflicted.

The expected generator files are absent from the collaborator archive, so they must be created or reconciled from the existing `generate-registry.ts`, `generate-subject-trees.ts`, `repo-registry.ts`, and Pages/manifest helpers.

### 2. Establish one registry loader

Use `GITHUB-REPOSITORIES.md` as the primary source of enabled repositories, stream assignments, branches, roots, priorities, and Pages settings. Keep the JSON registry only as a compatibility fallback during migration.

The loader must reject malformed repository identifiers, ignore disabled entries, preserve order/priority, and expose one normalized representation to both generation and runtime lookup.

### 3. Establish `json-fetch.ts`

Create or reconcile `json-fetch.ts` as the single repository-manifest fetcher. For each normalized registry entry it will:

1. Build the repository-root `files.json` URL using the configured repository, branch, Pages/raw policy, and root rules.
2. Fetch and parse the root `files.json`.
3. Preserve every source node’s repository-relative `path` exactly.
4. Attach `repo`, `branch`, `stream`, and other registry metadata.
5. Calculate and store the raw URL for each fetchable file.
6. Return a normalized repository instance for the generators.

The fetcher must not accept arbitrary repositories supplied by a browser request. Registry configuration remains the trust boundary.

### 4. Establish `generate-json-files.ts`

Create or reconcile `generate-json-files.ts` as the only generator for the Phase-I JSON artifacts. It will call `json-fetch.ts` for all enabled registry entries, build the complete `repo-registry.json`, filter the result by stream, assign the requested stream root names, and write the three stream files.

Generation must be deterministic and should use temporary files followed by rename where practical. A failed fetch must not overwrite a previously valid artifact with a partial or malformed file.

### 5. Run generation during startup

Both `npm run dev` and `npm start` must invoke the same startup preparation function before the server begins accepting requests.

```text
npm run dev  -> clean -> build -> startup generation -> listen
npm start    -> startup generation -> listen
```

The existing build-time generation may remain as a deployment compatibility step, especially for Vercel, but startup generation is the requested local/Node behavior. If remote generation fails and valid generated files exist, serve the last valid artifacts and emit an explicit stale-artifact warning. If no valid artifacts exist, fail visibly rather than silently returning an empty content tree.

### 6. Make `raw.ts` dominant

Change the normal browser file-click path so it uses the stored file-node raw URL metadata and sends the request through `/api/raw`. `raw.ts` will validate the requested repository/path against the configured registry, fetch the raw content, set the appropriate content type and response headers, and stream the file to the browser.

Existing local-file, Pages, jsDelivr, and alternate fallback methods will remain in the codebase during Phase I, but they will not be the normal path. They may be used only as explicit compatibility/failure fallbacks until PDF, Markdown, media, and download tests confirm that the raw path is sufficient.

### 7. Keep collaborator security upgrades isolated

Integrate the collaborator’s `/api/totp`, authenticated OAuth-link flow, administrator security context, admin UI, service-worker cache bump, and associated tests without coupling them to subject-tree generation. Confirm that the stricter administrator boundary is intentional:

```text
admin API access = valid admin JWT
                    + linked GitHub identity
                    + enrolled TOTP
```

The public content browser must remain accessible without administrator security enrollment. The GitHub webhook receiver must remain separately reviewed because server-to-server webhook authentication and administrator browser actions have different trust models.

## Phase-I cleanup and removal pass

Cleanup begins only after the canonical generator, startup preparation, generated artifacts, client reads, and raw delivery have passed verification. Removal is evidence-based and limited to files that are genuinely superseded by the new Phase-I path.

### Removal candidates

| Candidate | Removal condition | Default decision |
|---|---|---|
| `src/scripts/generate-registry.ts` | No active build/startup/import/test reference remains after `generate-json-files.ts` becomes canonical | Remove if fully superseded. |
| `src/scripts/generate-subject-trees.ts` | No active build/startup/import/test reference remains after stream generation moves to `generate-json-files.ts` | Remove if fully superseded. |
| `src/api/pages-fetch.ts` and/or `src/shims/pages-fetch.ts` | No canonical generator or dormant feature depends on it; raw manifest fetching has a verified replacement | Remove only the duplicate implementation; retain one helper if still needed. |
| Root-level generated `public/*-tree.json` files | Client and service-worker fallbacks no longer reference them, and `public/json/*-tree.json` is canonical | Remove duplicate artifacts only after reference scan. |
| Root-level `public/repo-registry.json` | No runtime/build/test path reads it after `public/json/repo-registry.json` is canonical | Remove after compatibility window. |
| Duplicate local registry/tree adapters | No active route or dormant retained feature imports them | Remove only after import graph and tests confirm. |
| Temporary analysis artifacts created during this task | Not part of the application and not referenced by project scripts | Remove from the project working tree before handoff. |

### Files not removed by default

The following remain unless a separate future-phase decision explicitly marks them obsolete: authentication and OAuth modules, TOTP modules, editor/PR modules, community/moderation modules, forum module, admin modules, GitHub App modules, webhook modules, blob uploads, service worker/offline files, and raw fallback logic.

A file is not removable merely because it is dormant. It is removable only when it is both outside the retained future scope and proven unreachable from the active build, startup, runtime, tests, and retained feature set.

## Verification gate before deletion

The cleanup pass may remove a candidate only after all of the following checks succeed:

1. A full-text import/reference scan finds no retained source, script, test, documentation command, or deployment entrypoint that requires the file.
2. The generated `repo-registry.json` and all stream trees are valid JSON and contain the expected roots, repositories, exact paths, stream scope, and raw URLs.
3. Startup generation works through both `npm run dev` and `npm start`.
4. `/api/raw` serves at least Markdown and PDF fixtures through the normal client path.
5. The browser no longer needs the removed fallback artifact or generator.
6. The collaborator security tests and all existing relevant tests pass.
7. The removal is recorded in a change log with the reason, replacement, and verification evidence.

## Final Phase-I deliverables

The completed phase will contain the canonical generator/fetcher, startup integration, generated JSON artifacts, raw-dominant client/server path, updated tests, a collaborator integration report, and a cleanup manifest listing every removed, retained, deferred, or conflicted file.
