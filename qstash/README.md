# QStash repository update workflow

GitHub push notifications are verified synchronously with `WEBHOOK_SECRET`, then enqueued in one of four fixed QStash FIFO queues, selected by hashing the repository identifier. QStash processes each queue serially (parallelism one), preserving order for a repository while also serializing unrelated repositories assigned to the same shard. Different shards can be processed concurrently. This caps the application's repository-update queue usage at four queues.

The worker verifies QStash signatures at `POST /api/workflows/repository-update`, re-reads current repository settings and branch head, synchronizes the Supabase catalog, then refreshes only the affected public indexes in Redis. QStash retries failed worker deliveries; synchronization and index rebuilds are idempotent.

## Required server environment

- `QSTASH_TOKEN` — publisher token.
- `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` — active and rotation signing keys from Upstash.
- `APP_BASE_URL` — canonical public HTTPS origin of the deployed Next.js app, without a path. Signature verification uses this exact origin plus `/api/workflows/repository-update`.
- `QSTASH_URL` — optional QStash API base URL; defaults to `https://qstash.upstash.io`.
- `WEBHOOK_SECRET` — shared with GitHub Actions for the initial push notification.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KV_REST_API_URL`, and `KV_REST_API_TOKEN` — worker database and index-cache access.

Keep all QStash and webhook values server-only. Configure them in local `.env.local` and the production host's environment; `.env.example` contains names/placeholders only.

For the current deployment, the canonical origin is `https://notebooks-framework.vercel.app`. Do not include `/science` in `APP_BASE_URL`; that path selects the website page, not the API host origin.

## Queue behavior

Queue names are limited to `repo-update-shard-0` through `repo-update-shard-3`; the application must not create one queue per repository. If migrating from legacy per-repository queues and the QStash queue quota is full, drain and remove obsolete queues before relying on new shards. Do not delete queues that may still contain messages. Do not increase shard parallelism unless the database update path is changed to handle concurrent commits safely.

File download API requests remain synchronous because clients expect the Markdown body in the same response. They are protected by per-API-key rate limiting and content caching, not sent through QStash.
