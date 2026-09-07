# Workflow Consolidation Handoff

## Result

The NoteBooks Framework `whoami` branch now contains one canonical reusable workflow for source-tree synchronization: `.github/workflows/tree-sync.yml`. The former Framework workflows `fmmupdate.yaml`, `rebuild-tree.yml`, and `notify-app-example.yml` were removed. The remaining workflow set is now limited to `ci.yml`, `deploy-staging.yml`, `integration.yml`, and `tree-sync.yml`.

The canonical workflow performs the complete source-side sequence: it checks out the calling repository, runs `python3 fmtree.py --out files.json`, validates the generated JSON, commits `files.json` using the GitHub Actions bot identity, deploys the static site to GitHub Pages, and sends one HMAC-SHA256 signed `POST` request to `/api/workspace/tree/rebuild`. The source caller uses `paths-ignore: ['files.json']`, so the generated manifest commit does not start a second workflow run.

The rebuild payload contains `streams`, `origin`, `repository`, `commit`, and `reason`. The origin is derived from `github.repository`; it is not caller-supplied. The Framework API separately checks that the repository and stream are authorized by the generated repository registry and uses the shared lock to drop overlapping deployment requests.

## Published Framework commits

| Commit | Purpose |
|---|---|
| `a36dd6d` | Consolidated the Framework workflows into `tree-sync.yml` and added regression coverage. |
| `0b12f14` | Preserved GitHub Pages deployment metadata in the reusable workflow and expanded the protocol documentation. |
| `7fc5288` | Refreshed the tracked file inventory and generated responsibility manifests after removing the legacy workflows. |

The `whoami` branch is clean and synchronized with `origin/whoami` at `7fc5288`.

## Source-repository caller files

Validated local caller commits are prepared for the following repositories:

| Repository | Stream | Local commit | Remote status |
|---|---|---:|---|
| `fsr-science/NCERT-Science` | `science` | `97059d9` | Not pushed: authenticated account received HTTP 403. |
| `fsr-humanities/NCERT-Humanities` | `humanities` | `44f229f` | Not pushed: authenticated account lacks write access. |
| `fsr-commerce/NCERT-Commerce` | `commerce` | `21907a7` | Not pushed: authenticated account lacks write access. |

Each local commit replaces all four remote source workflows (`fmmupdate.yaml`, `pages.yaml`, `rebuild-tree.yaml`, and `static.yml`) with one `.github/workflows/tree-sync.yml` caller that references `fsr-official/NoteBooks-Framework/.github/workflows/tree-sync.yml@whoami`.

## Activation requirements

Before merging or pushing the source caller files, add these two Actions secrets to each source repository:

```text
TREE_REBUILD_URL=https://notebooks-framework.vercel.app/api/workspace/tree/rebuild
TREE_REBUILD_SECRET=<the same long random value configured in Framework Vercel>
```

The Framework Vercel project must also contain `TREE_REBUILD_SECRET` and `TREE_REBUILD_DEPLOY_HOOK_URL`. The Deploy Hook URL must target the production branch and must never be committed or printed in logs.

A maintainer with write access to each source repository should apply the prepared caller file or cherry-pick the local commit, then push to `main`. The source repository must allow the public Framework repository to be used as a reusable workflow.

## Verification

The final local gate passed: all four Framework workflows parsed as YAML; the focused workflow, rebuild API, and registry tests passed with **11 tests passing**; TypeScript server type checking passed; `git diff --check` passed; the Framework branch contains no tracked legacy workflow files; and all three source caller workflows passed stream, origin, secret, Pages permission, and `files.json` path-ignore assertions.

Production endpoint verification remains intentionally pending until the Vercel Deploy Hook authorization and the two source-repository Actions secrets are available. No runtime tree refresh or expensive cache invalidation was introduced.
