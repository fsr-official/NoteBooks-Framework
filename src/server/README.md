# Express Server and Route Composition

This directory contains the server-side entrypoint and route composition for NoteBooks Framework. The application is an Express 5 server written in TypeScript and compiled to `dist/` for local production-shaped startup and Vercel’s catch-all adapter.

## Files

| File | Responsibility |
| --- | --- |
| `server.ts` | Creates the Express application, applies security/body/static middleware, mounts API routes, and starts the local listener. |
| `api-routes.ts` | Registers the authoritative `/api/*` route table and orders authentication, role, TOTP, rate-limit, and handler middleware. |

## Runtime behavior

`npm run dev` cleans stale generated JavaScript, runs the complete build/generator pipeline, and starts the compiled server. `npm start` starts an already-built server. The default port is `4000`, overridden by `PORT`.

The server serves the static project root and exposes public read endpoints for the registry, eager stream trees, raw files, health/version data, and public workspace surfaces. Account, Community, Issues, admin, Blob, conversion, and GitHub write paths are separately protected. A public HTML shell is not an authorization boundary; APIs enforce authorization.

## Configuration and safety

Production requires the environment variables listed in [`README.md`](../../README.md). The server should fail closed for missing credentials on the capability that needs them and must never print secret values. PostgreSQL/Supabase is the intended durable store; KV and process-memory fallbacks are for controlled local/degraded operation only.

Changes to route composition require focused endpoint-protection tests and a full typecheck/test/build pass. Changes to static scripts or styles also require a service-worker cache-version update. The current renderer/upload implementation uses strict Mermaid mode, protected SVG conversion, and raw delivery as the canonical file-byte path.
