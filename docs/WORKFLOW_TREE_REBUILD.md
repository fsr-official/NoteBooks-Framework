# GitHub workflow tree rebuild

The NoteBooks Framework exposes a server-to-server endpoint for refreshing a stream tree after a registered source repository workflow completes:

```text
POST https://notebooks-framework.vercel.app/api/workspace/tree/rebuild
```

## Authoritative origin and stream mapping

The API derives authorization from the repository entries in `GITHUB-REPOSITORIES.md` through the generated `public/json/github-repos.json` artifact. A request must provide the source repository in both the `repository` JSON field and the `X-Notebooks-Workflow-Origin` header. The values are normalized and checked against the registered `repo` field, and the requested stream must match that registry entry.

For example, the current registry maps:

| Workflow repository | Registry stream | Allowed rebuild |
|---|---|---|
| `fsr-science/NCERT-Science` | `SCIENCE` | `science` |
| `fsr-commerce/NCERT-Commerce` | `COMMERCE` | `commerce` |
| `fsr-humanities/NCERT-Humanities` | `HUMANITIES` | `humanities` |

Community and Issues entries remain in the registry, but they are not academic stream-tree targets and therefore cannot call this endpoint with `community` or `issues`.

## Security configuration

Set only the signing secret in Vercel:

```text
TREE_REBUILD_SECRET=<long random secret>
```

The endpoint also accepts the existing `WEBHOOK_SECRET` or `GITHUB_WEBHOOK_SECRET` as a compatibility fallback, but an isolated `TREE_REBUILD_SECRET` is preferred. The same secret must be stored as `TREE_REBUILD_SECRET` in each source repository’s GitHub Actions secrets.

Each request must include an HMAC-SHA256 signature over the exact request body:

```text
X-Notebooks-Workflow-Origin: fsr-science/NCERT-Science
X-Notebooks-Signature: sha256=<HMAC-SHA256>
```

## Reusable workflow

The reusable workflow is available at `.github/workflows/rebuild-tree.yml`. A source repository can call it after its content update job:

```yaml
jobs:
  rebuild-notebooks-tree:
    needs: build-content
    uses: fsr-official/NoteBooks-Framework/.github/workflows/rebuild-tree.yml@main
    with:
      stream: science
    secrets:
      TREE_REBUILD_URL: https://notebooks-framework.vercel.app/api/workspace/tree/rebuild
      TREE_REBUILD_SECRET: ${{ secrets.TREE_REBUILD_SECRET }}
```

The workflow derives its origin from `${GITHUB_REPOSITORY}`. It does not accept a caller-supplied origin input, preventing a workflow from claiming to be another registered repository.

## Concurrency and dropped requests

Only one rebuild may run at a time. A second request received while a rebuild is active is deliberately dropped with HTTP `409` and this response shape:

```json
{
  "success": false,
  "dropped": true,
  "error": "A tree rebuild is already in progress"
}
```

The lock is single-flight within the running process and uses the existing Upstash shared cache when configured, so concurrent Vercel instances also coordinate when shared Redis credentials are available. The lock expires automatically after 90 seconds as a safety valve.

## Refresh behavior and recursion prevention

An authorized rebuild invalidates the local and shared stream-tree caches, fetches the current source manifest, rebuilds the runtime tree, and marks that stream as runtime-preferred for subsequent requests. It does not commit or edit the source repository, does not write generated artifacts back to GitHub, and does not dispatch another workflow. Therefore, the rebuild callback itself cannot cause a recursive rebuild loop.

The normal direction is intentionally one-way:

```text
source repository content change
  → source workflow
  → signed rebuild request
  → runtime/shared tree refresh
```

Canonical `public/json/*-tree.json` artifacts are still regenerated during the Framework build. If the source repository workflow also commits an updated manifest or tree file, that commit may trigger the source workflow again depending on its own `on.push.paths` configuration. To avoid a loop, source workflows should exclude generated artifacts from their rebuild trigger, use a bot-commit guard, or keep artifact generation in the Framework build only.

## Manual signed request

Construct and sign the exact body before sending it:

```bash
payload='{"streams":["science"],"origin":"fsr-science/NCERT-Science","repository":"fsr-science/NCERT-Science","commit":"abc123","reason":"manual rebuild"}'
signature="sha256=$(printf '%s' "$payload" | openssl dgst -sha256 -hmac "$TREE_REBUILD_SECRET" -hex | sed 's/^.* //')"
curl --fail-with-body -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-Notebooks-Workflow-Origin: fsr-science/NCERT-Science' \
  -H "X-Notebooks-Signature: $signature" \
  --data-binary "$payload" \
  'https://notebooks-framework.vercel.app/api/workspace/tree/rebuild'
```
