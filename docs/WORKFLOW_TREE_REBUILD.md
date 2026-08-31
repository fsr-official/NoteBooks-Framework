# GitHub workflow tree rebuild

The NoteBooks Framework exposes a server-to-server endpoint for refreshing the runtime stream tree after a source repository workflow completes:

```text
POST https://notebooks-framework.vercel.app/api/workspace/tree/rebuild
```

The endpoint requires both an exact workflow origin and an HMAC-SHA256 signature. The origin is not taken from the network `Origin` header; it is an explicit `X-Notebooks-Workflow-Origin` value that identifies the repository workflow. This prevents an arbitrary client from selecting a stream merely by spoofing a browser header.

## Vercel configuration

Set these environment variables in the production project:

| Variable | Example | Purpose |
|---|---|---|
| `TREE_REBUILD_ALLOWED_ORIGINS` | `fsr-official/NCERT-Science=science,fsr-official/NCERT-Commerce=commerce,fsr-official/NCERT-Humanities=humanities` | Exact origin-to-stream allowlist |
| `TREE_REBUILD_SECRET` | A long random secret | HMAC secret shared with the workflows |

The same `TREE_REBUILD_SECRET` must be added as a GitHub Actions secret in each source repository. The endpoint also accepts the existing `WEBHOOK_SECRET` or `GITHUB_WEBHOOK_SECRET` as a fallback, but `TREE_REBUILD_SECRET` is preferred so this capability has an isolated credential.

## Workflow usage

The reusable workflow is available at `.github/workflows/rebuild-tree.yml`. A source repository can call it after its content update job:

```yaml
jobs:
  rebuild-notebooks-tree:
    needs: build-content
    uses: fsr-official/NoteBooks-Framework/.github/workflows/rebuild-tree.yml@main
    with:
      stream: science
      origin: fsr-official/NCERT-Science
    secrets:
      TREE_REBUILD_URL: https://notebooks-framework.vercel.app/api/workspace/tree/rebuild
      TREE_REBUILD_SECRET: ${{ secrets.TREE_REBUILD_SECRET }}
```

The Science, Commerce, and Humanities origins must use their matching stream scope. A Science origin cannot request Commerce or Humanities. The request body contains the stream, source repository, commit, workflow reason, and explicit origin. The workflow computes `sha256=<HMAC>` over the exact JSON bytes sent to the endpoint.

## Runtime behavior

For every authorized stream, the endpoint invalidates the local and shared runtime cache, rebuilds the tree from the registered repository manifest, and marks the refreshed stream as runtime-preferred for the current process. Subsequent `/api/system/:stream` requests return the rebuilt runtime tree instead of the bundled artifact for that process. The response includes the rebuilt stream, repository count, and refresh timestamp.

This does not attempt to write into the deployed Git checkout. Vercel serverless filesystems are not a durable deployment store. The canonical `public/json/*-tree.json` artifacts continue to be produced during the normal GitHub/Vercel build; this endpoint handles immediate runtime refresh after a source workflow changes.

## Manual signed request

For a local or administrative test, construct the exact body first and sign those exact bytes:

```bash
payload='{"streams":["science"],"origin":"fsr-official/NCERT-Science","repository":"fsr-official/NCERT-Science","commit":"abc123","reason":"manual rebuild"}'
signature="sha256=$(printf '%s' "$payload" | openssl dgst -sha256 -hmac "$TREE_REBUILD_SECRET" -hex | sed 's/^.* //')"
curl --fail-with-body -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-Notebooks-Workflow-Origin: fsr-official/NCERT-Science' \
  -H "X-Notebooks-Signature: $signature" \
  --data-binary "$payload" \
  'https://notebooks-framework.vercel.app/api/workspace/tree/rebuild'
```

Unsigned requests, unknown origins, invalid signatures, unsupported streams, and scope mismatches return an error without rebuilding anything.
