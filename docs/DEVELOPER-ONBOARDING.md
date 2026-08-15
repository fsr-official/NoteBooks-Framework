# Developer Onboarding — NoteBooks Framework

Summary
- Purpose: fast start guide for developers taking over this repo.
- Snapshot date: 2026-08-15

Architecture overview
- Backend: TypeScript Node.js API located under `src/` with Express-style routing in `src/server/server.ts` and API modules in `src/api/`.
- Lib helpers: `src/lib/` contains GitHub App helpers, DB helpers, and permission utilities.
- Client/public: lightweight frontend assets in `public/` and `src/client`.
- Tests: Vitest tests in `tests/` exercise API flows and GitHub app logic.

What changed recently (today)
- Added subject-aware mounting and three-way split for each subject (repo content, community, issues).
- Added `getSubjectRepo()` helper to resolve `SUBJECT_REPOS` mapping.
- Community posts now accept and persist a `subject` field and create subject-tagged GitHub Discussions/PRs.
- Added subject-scoped API routes under `/api/subject/:subject/...`.
- Added retry/backoff logic to GitHub App PR creation and merge flows.
- Added audit logging of PR actions to `logs/admin-actions.log`.

Remaining backend work
- Harden GitHub App auto-merge: retry on webhook delivery failures, add idempotency and better error telemetry.
- Ensure DB migrations are applied in production and CI; a migration file `src/db/migrations/2026-08-15-add-community-subject.sql` was added.
- Expand subject persistence across all workflows (extra APIs may still accept subject via body only).

Frontend work remaining
- Expose subject mounts and navigation in the frontend UI.
- Admin UI for role/ban actions and viewing `logs/admin-actions.log`.
- Post approval flows: UI to preview and approve community posts, and to view PRs generated from posts.

Environment variables (important)
- `GITHUB_REPO` — primary owner/repo (owner/name)
- `GITHUB_COMMUNITY_REPO` — repo for discussions (owner/name)
- `GITHUB_ISSUES_REPO` — repo to open issues/PRs for content (owner/name)
- `SUBJECT_REPOS` — comma-separated mapping of subject=owner/repo pairs (e.g. "science=org/NCERT-Science,math=org/NCERT-Math")
- `GITHUB_TOKEN` / `GITHUB_PAT` — fallback tokens for octokit when app creds not available
- `GITHUB_APP_AUTO_PR` — `true` to auto-create PRs for approved posts
- `GITHUB_APP_AUTO_MERGE` — `true` to auto-merge created PRs
- `GITHUB_APP_AUTO_MERGE_METHOD` — `merge|squash|rebase` (default `merge`)
- `GITHUB_REPO_BASE` — default branch name (default `main`)
- `COMMUNITY_CONTENT_PATH` — path in repo where generated posts are committed
- `JWT_SECRET` — secret for auth tokens
- Database connection envs — see your deployment/CI conventions (the project uses `src/lib/db` helpers)

Key files and why they matter
- `src/server/server.ts` — app entry; routes, static serving, subject-scoped endpoints.
- `src/api/community.ts` — create/approve community posts; now subject-aware and triggers discussions/PRs.
- `src/api/submit-pr.ts` — editor PR submission flow; now prefers subject-specific targets when `subject` provided.
- `src/api/_shared.ts` — octokit factory and `getSubjectRepo(subject)` mapping resolver.
- `src/lib/github-app.ts` — App-authenticated helpers for discussion/PR creation and merging (includes retry/backoff).
- `src/db/migrations/*.sql` — DB migrations; ensure these run in production.
- `tests/` — unit and integration tests; run `npm test` to validate local changes.
- `docs/DEVELOPER-ONBOARDING.md` — this file (start here).

How to run the project locally
1. Install dependencies:
```bash
npm ci
```
2. Start a local Postgres and export DB connection envs according to your setup.
3. Run migrations (the repo provides `src/scripts/migrate-db.js`):
```bash
node src/scripts/migrate-db.js
```
4. Run tests:
```bash
npm test
```
5. Start dev server:
```bash
npm run dev
```

Deployment (quick)
- A Dockerfile and `docker-compose.yml` are provided in the repo root for an opinionated container-based deployment. See the files `Dockerfile` and `docker-compose.yml`.

Notes for the next developer
- Check `process.env.SUBJECT_REPOS` format before deploying; incorrect mapping causes subject lookups to return null.
- Audit logs are appended to `logs/admin-actions.log`; ensure write permissions for the runtime.
- Tests are fast; run the subset when working on a feature to keep feedback quick.

Contact & context
- If you need the original decision logs or the conversation trail for these changes, the project workspace contains the automated transcripts in the workspace storage used by the previous agent; search in the developer machine under the Code workspace storage if needed.

-- End of onboarding
