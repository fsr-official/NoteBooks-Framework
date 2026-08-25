> **Document status:** historical implementation record. For current behavior, use [`docs/README.md`](../../README.md), the root [`README.md`](../../../README.md), and the active architecture/release documents.
>
# Local Manifest Ownership

## Canonical path

`fmtree.py` is the canonical producer of the local project manifest at the repository root: `files.json`. The landing page reads that manifest through `/files.json`, and the server serves it through the local file-manifest route. The manifest is intentionally separate from the remote stream artifacts under `public/json/`. Running `fmtree.py` without flags never writes a registry; the optional `--registry` flag is an explicit compatibility operation and does not replace the canonical remote registry generator.

## Execution paths

| Context | Command | Output consumed by |
|---|---|---|
| Local development/build | `npm run generate:local-manifest` | `/files.json`, landing local-document cards, local file browser |
| `npm run build` | Runs `generate:local-manifest` before version and remote stream generation | Production/static artifact preparation |
| GitHub automation | `.github/workflows/fmmupdate.yaml` runs `python3 fmtree.py --output files.json` and commits changed `files.json` | Repository-local manifest freshness |
| Runtime fallback | `/files.json` is served from the configured workspace manifest or regenerated local tree | Landing page and local file routes |
| Regression test | `tests/fmtree.test.ts` scans a temporary fixture | README/architecture inclusion, source/test/public exclusion, and no implicit registry output |

## Content boundary

The local manifest includes allowed local documentation/content files such as Markdown, text, and PDF files. It excludes application source, public runtime assets, dependency/build output, tests, and JSON artifacts. This prevents the landing page from confusing project documentation with the remote Science, Commerce, and Humanities stream trees.

## Upgrade rules

Changes to local files or the allowed extension/exclusion policy must be made in `fmtree.py` first. The npm build command and GitHub workflow must continue to call the same producer. The landing page must consume `/files.json`; it must not independently reconstruct the local tree or read the remote registry for project documentation.

Remote repository manifests remain owned by `src/scripts/json-fetch.ts` and `src/scripts/generate-json-files.ts`. They write `public/json/repo-registry.json` and `public/json/<stream>-tree.json` and must not be merged with `fmtree.py` output.
