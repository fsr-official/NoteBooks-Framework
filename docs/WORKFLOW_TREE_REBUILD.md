# GitHub workflow static tree rebuild

The NoteBooks Framework exposes a server-to-server endpoint that triggers a new Vercel deployment after a registered source repository workflow completes:

```text
POST https://notebooks-framework.vercel.app/api/workspace/tree/rebuild
```

The endpoint calls a Vercel Deploy Hook. Vercel then reruns the project Build Step, including `generate:github-repos` and `generate:json-files`, and publishes the regenerated `public/json/*-tree.json` artifacts. This keeps normal tree reads static and fast; they continue to fetch bundled JSON rather than rebuilding or refreshing runtime caches.

## Authoritative origin and stream mapping

The API validates the source repository against the generated registry, whose source is `GITHUB-REPOSITORIES.md`. A request must provide the repository in both the `repository` JSON field and the `X-Notebooks-Workflow-Origin` header. Both values must match after normalization, and the registered repository must be enabled for the requested stream.

| Workflow repository | Registry stream | Allowed rebuild |
|---|---|---|
| `fsr-science/NCERT-Science` | `SCIENCE` | `science` |
| `fsr-commerce/NCERT-Commerce` | `COMMERCE` | `commerce` |
| `fsr-humanities/NCERT-Humanities` | `HUMANITIES` | `humanities` |

Community and Issues remain in the repository registry, but they are not academic stream-tree targets and cannot call this endpoint with `community` or `issues`.

## Vercel configuration

Create a Deploy Hook for the connected NoteBooks Framework Vercel project, targeting the production branch. Vercel documents Deploy Hooks as POST URLs that trigger a deployment and rerun the Build Step: [Creating and Triggering Deploy Hooks](https://vercel.com/docs/deploy-hooks).

Set the resulting URL as:

```text
TREE_REBUILD_DEPLOY_HOOK_URL=https://api.vercel.com/v1/integrations/deploy/<project>/<hook-token>
```

Treat this URL as a credential. Do not commit it to the repository or print it in workflow logs.

Also set:

```text
TREE_REBUILD_SECRET=<long random HMAC secret>
```

The same `TREE_REBUILD_SECRET` must be stored in GitHub Actions secrets for each source repository.

## Reusable workflow

The canonical reusable workflow is available at `.github/workflows/tree-sync.yml`. The former `fmmupdate.yaml`, `rebuild-tree.yml`, and `notify-app-example.yml` files have been removed from this repository. A source repository can call it after its content update job:

```yaml
jobs:
  rebuild-notebooks-tree:
    needs: build-content
    uses: fsr-official/NoteBooks-Framework/.github/workflows/tree-sync.yml@whoami
    with:
      stream: science
    secrets:
      TREE_REBUILD_URL: https://notebooks-framework.vercel.app/api/workspace/tree/rebuild
      TREE_REBUILD_SECRET: ${{ secrets.TREE_REBUILD_SECRET }}
```

The workflow derives the origin from `${GITHUB_REPOSITORY}`. It does not accept a caller-supplied origin, so a workflow cannot claim to be another registered repository.

## Concurrency and dropped requests

Only one deployment trigger is allowed within the deduplication lease. A second request received while a deployment is pending returns HTTP `409` with:

```json
{
  "success": false,
  "dropped": true,
  "error": "A static tree deployment is already pending"
}
```

The lock uses the existing Upstash shared cache when configured, allowing separate Vercel instances to coordinate. A local fallback protects a single running instance. The default lease is ten minutes, which covers the expected build/deployment interval and prevents a burst of source-workflow events from starting repeated builds. The lease expires automatically as a safety valve.

## Repository edits and recursion

The API does not edit any GitHub repository. It only calls the Vercel Deploy Hook. The source workflow commits the generated `files.json` back to its own source repository, while the Framework build reads the current `GITHUB-REPOSITORIES.md` and source manifests, generates the static artifacts, and deploys them.

Therefore, a normal content edit follows one direction:

```text
NCERT repository change
  → NCERT workflow
  → signed Framework rebuild request
  → Vercel Deploy Hook
  → Framework build regenerates static tree JSON
  → production serves the new bundled tree
```

The rebuild cannot recursively call itself because the Framework build does not POST to the endpoint. The source workflow’s `on.push.paths-ignore: ['files.json']` rule excludes its own generated-artifact commit from starting another run; ordinary content edits still trigger the workflow once.

## Request contract

The signed JSON body should contain one stream and the actual calling repository:

```json
{
  "streams": ["science"],
  "origin": "fsr-science/NCERT-Science",
  "repository": "fsr-science/NCERT-Science",
  "commit": "abc123",
  "reason": "content workflow completed"
}
```

The `origin` body field is informational; authorization uses the `repository` body field and the matching `X-Notebooks-Workflow-Origin` header.
