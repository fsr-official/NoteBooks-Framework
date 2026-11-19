# Public index cache

Supabase remains the source of truth. This Redis instance stores generated public lookup documents so the client and cached Next.js route do not repeatedly query and render the growing repository/file table.

## Configuration

Create an Upstash Redis database in the region closest to the Next.js deployment. Copy its REST URL and token into the server environment as:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Never expose either variable to browser code or commit their values.

The root `.env.example` lists the variable names. For local development, set them in `NoteBooks-Frameworkv2/.env.local`; for production, set them as server-side deployment environment variables. Do not prefix them with `NEXT_PUBLIC_`.

## Key layout

Each logical index has a separate JSON and JSONL key:

```text
notebooks:public-index:v1:lowersecondary-tree:json
notebooks:public-index:v1:lowersecondary-tree:jsonl
notebooks:public-index:v1:science-tree:json
notebooks:public-index:v1:science-tree:jsonl
notebooks:public-index:v1:commerce-tree:json
notebooks:public-index:v1:commerce-tree:jsonl
notebooks:public-index:v1:humanities-tree:json
notebooks:public-index:v1:humanities-tree:jsonl
notebooks:public-index:v1:developer-tree:json
notebooks:public-index:v1:developer-tree:jsonl
notebooks:public-index:v1:github_repositories:json
notebooks:public-index:v1:github_repositories:jsonl
```

Separating the formats lets a JSON client retrieve only the keyed lookup document instead of downloading and parsing the JSONL export too. Values are JSON-string encoded in Redis so Upstash's automatic deserializer returns the exact document text (including JSONL). A regeneration writes both formats with one Redis pipeline.

## Rebuild behavior

- `pnpm indexes:rebuild` reads active repository anchors and files from Supabase, then publishes all six indexes.
- `pnpm redis:verify` checks all 12 format keys, validates the JSON/JSONL payloads, confirms paired entry counts, and reports sizes without printing cached content.
- The signed repository update endpoint publishes only the updated repository's section. Its existing metadata is unchanged, so the repository-list index is not rewritten.
- Admin APIs that alter repository metadata must rebuild `github_repositories`; if a repository moves streams, rebuild both the previous and new section.
- Redis failures are explicit. The endpoint returns an error so the request can be retried; JSON is not silently served from a stale or partial database fallback.
- Public reads go through `/api/public/json/{filename}` with CDN cache headers. The response is served from one format-specific Redis key.

Full generation queries each active repository once, fetches file rows in bounded batches, builds the five section documents from that shared snapshot, and sends format writes in a pipeline per index. Query pagination protects against Supabase response row limits.

## Initial setup and recovery

1. Configure the Upstash REST URL/token in the backend's local or production environment.
2. Ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are also configured server-side.
3. Run `pnpm indexes:rebuild` to populate or fully refresh the public indexes.
4. Run `pnpm redis:verify` to validate all index keys and both formats.
5. Serve public assets from `/api/public/json/{filename}`. Example names include `science-tree.json`, `science-tree.jsonl`, `github_repositories.json`, and `github_repositories.jsonl`.

The rebuild is idempotent and can be safely rerun after restoring Redis or recovering from a failed publication. Normal repository updates only rebuild their own section. A shared Upstash Redis database is recommended for horizontally scaled Next.js instances; the in-process Redis client is reused within each server process, while index data remains shared across instances.

## Performance and operations

- Keep the Redis region close to the application to reduce REST request latency.
- Each public request reads one format-specific Redis key; the response sets `s-maxage=300` and `stale-while-revalidate=3600` for CDN caching.
- Publish both formats with a Redis pipeline to reduce network round trips. Store them as separate keys so JSON clients do not download JSONL data.
- Check Upstash request volume, storage, and latency in its console. JSONL duplicates index content, so monitor storage as repositories grow.
- Full rebuilds read from Supabase and are intended for initial publication/recovery; routine updates should use the selective webhook path.
