# NoteBooks Content API

The v1 API lets registered NoteBooks accounts create, inspect, and revoke API keys, then use a key to download Markdown files from enabled repositories.

Base URL: `https://<your-deployment>/api/v1`

## Create an API key

Create an account through `/register` or Supabase Auth first, supplying its chosen ID as `account_id` signup metadata. The Auth signup trigger creates its matching `public.accounts` row. GitHub OAuth users receive a generated `user-…` account ID. Then call `POST /keys` with the account's Supabase access token:

```ts
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: { data: { account_id } },
});
```

Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the website's Supabase client. Never use the service-role key in the client.

The signup call returns a Supabase access token when the account is authenticated. If email confirmation is enabled, wait for the user to confirm and sign in before requesting an API key.

```sh
curl --request POST "$NOTEBOOKS_URL/api/v1/keys" \
  --header "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{"name":"my-content-client"}'
```

For the key-creation example, replace the `******` authorization placeholder with `Bearer $SUPABASE_ACCESS_TOKEN`. The response contains the `nbv2_...` key once. Copy it securely; only a SHA-256 hash and a short identifying prefix are stored in the database. An account can have at most five active keys. List keys with `GET /keys` and revoke a key with `DELETE /keys/{id}` using the same Supabase access token.

## Download a Markdown file

```sh
curl --get "$NOTEBOOKS_URL/api/v1/files" \
  --header "Authorization: Bearer $NOTEBOOKS_API_KEY" \
  --data-urlencode "owner=fsr-science" \
  --data-urlencode "repo=NCERT-Science" \
  --data-urlencode "path=Physics/Chapter 1.md" \
  --output "Chapter 1.md"
```

For this download example, replace the `******` authorization placeholder with `Bearer $NOTEBOOKS_API_KEY`.

Only `.md`, `.markdown`, and `.mdx` paths in enabled, non-archived repositories are downloadable. The API resolves file metadata from the catalog, fetches content pinned to the synchronized commit, verifies the Git blob SHA, and caches verified content in Redis by SHA for 24 hours. Individual files are limited to 2 MiB.

The API key is accepted only in the `Authorization: Bearer` header, never in a URL. Each API key has a token-bucket limit of 60 requests per minute (burst capacity 60). A `429` response includes `Retry-After`, `RateLimit-Limit`, and `RateLimit-Remaining`. Successful responses include an `ETag` equal to the file SHA; send `If-None-Match` to request a lightweight `304`.

Responses are `private, no-store` because they are authorized by key. Do not put keys in browser code or expose them in logs. Keys can be revoked immediately using the management endpoint.

## Endpoints

- `POST /api/v1/keys` — create a key; requires a valid Supabase access token and an existing application account.
- `GET /api/v1/keys` — list the caller's key metadata; requires a valid Supabase access token.
- `DELETE /api/v1/keys/{id}` — revoke one of the caller's keys; requires a valid Supabase access token.
- `GET /api/v1/files?owner=...&repo=...&path=...` — download one catalogued Markdown file; requires a NoteBooks API key.

The OpenAPI contract is in [`openapi.yaml`](openapi.yaml).
