# Developer Onboarding — NoteBooks Framework

**Status:** active onboarding guide. Read this with [`README.md`](../README.md), [`docs/phase1/REAL-ARCHITECTURE.md`](phase1/REAL-ARCHITECTURE.md), and [`docs/MARKDOWN-RENDERER.md`](MARKDOWN-RENDERER.md).

## Before changing code

NoteBooks is a TypeScript Express server with a static vanilla-JavaScript client. Science, Commerce, and Humanities are streams. Community and Issues are separate workspaces. The repository registry is authoritative, content trees are eager, and `src/api/raw.ts` is the dominant file-byte delivery path. Do not introduce lazy subtree loading or bypass the registry with ad hoc repository inference unless a compatibility case is documented.

The project acknowledges [Pratyush-Chanda/Ada](https://github.com/Pratyush-Chanda/Ada) as a source project and Pratyush Chanda’s help within the NoteBooks Project. This current repository has its own implementation boundaries and should be changed according to the current code and route composition.

## Local workflow

Install dependencies and run the normal checks:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm start
```

`npm run dev` performs the build and then starts the compiled server. The default local port is `4000`; set `PORT` when another port is needed. The build runs `fmtree.py`, generates `public/json/github-repos.json`, creates eager registry/stream trees, generates version metadata, and compiles client/server TypeScript.

Database integration tests are intentionally opt-in. Use a disposable PostgreSQL database and set both `DATABASE_URL` and `RUN_DB_INTEGRATION_TESTS=true`. Never point integration tests at a production database.

## Where to work

| Task | Primary files |
| --- | --- |
| Add or change a route | `src/server/api-routes.ts`, then the relevant `src/api/*.ts` handler and protection middleware. |
| Change stream discovery | `GITHUB-REPOSITORIES.md`, `src/scripts/generate-github-repos.ts`, `src/scripts/generate-json-files.ts`, and `src/api/system.ts`. |
| Change file delivery | `src/api/raw.ts` and `public/js/raw-delivery.js`; preserve path validation and raw dominance. |
| Change Markdown | `public/js/markdown.js`, `md-init.js`, `obsidian-markdown-it.js`, and `docs/MARKDOWN-RENDERER.md`. |
| Change themes or reader settings | `public/js/theme.js`, `reading-preferences.js`, `src/api/theme.ts`, `src/api/session.ts`, and session persistence. |
| Change Community or Issues | The relevant `src/api/community*.ts`, `src/api/issues.ts`, review handlers, migrations, and browser surface. |
| Change uploads or diagrams | `public/js/upload.js`, `src/api/blob.ts`, `src/lib/image-to-svg.ts`, attribution manifests, and conversion tests. |
| Change schema | Add an ordered SQL file in `src/db/migrations/`, test locally, and reconcile production migration history deliberately. |
| Change caching/offline behavior | `service-worker.js`, cache-version tests, and browser route checks. |

## Environment configuration

The minimum real production configuration is documented in the README. The most important variables are `JWT_SECRET`, `DATABASE_URL`, a GitHub read/write credential appropriate to the configured repositories, `GITHUB_REPO` or registry entries, `GITHUB_BRANCH`, `BLOB_READ_WRITE_TOKEN`, and `APP_URL`. OAuth, GitHub App, Resend, reCAPTCHA, webhook, and KV variables are required only when the corresponding capability is enabled.

Use `KV_REST_API_URL` and `KV_REST_API_TOKEN` for the current KV adapter. Do not copy the older `UPSTASH_REDIS_REST_*` names from historical documentation unless an explicit compatibility layer has been added. Never print secret values in logs, pull requests, test output, or support messages.

## Security rules

Public reads may be anonymous, but writes must pass the route’s intended authentication, role, CSRF, rate-limit, and TOTP boundaries. Native SVG uploads are sanitized. Raster conversion is explicitly reported as an embedded-raster SVG container, not a true vector trace. Preserve original and derivative metadata through review and approval.

Do not enable Supabase RLS on production tables without writing and testing policies for the server access model. Conversely, do not treat a database with RLS disabled as production-safe; the release audit must resolve that boundary before launch.

## Pull-request workflow

Work on a feature branch or the requested staging branch. Before committing, run syntax checks for modified browser scripts, `npm run typecheck`, focused tests, the full `npm test`, `npm run build`, and a production dependency audit. Inspect generated files after a build and do not hand-edit generated JSON in place of the source registry.

For GitHub changes, use the GitHub CLI and inspect the target branch before pushing. The current staging target is `whoami`; production promotion and tagging remain separate decisions. A successful local build is not evidence that Vercel is linked to the correct repository or that production environment variables exist.

## Documentation maintenance

When behavior changes, update the nearest active documentation in the same change. Historical phase reports may retain their original narrative, but they must be labeled as historical snapshots and must not contradict the active README, architecture map, environment matrix, or renderer contract. Do not include credentials, private URLs, raw session tokens, or references to hidden workspace transcripts in documentation.
