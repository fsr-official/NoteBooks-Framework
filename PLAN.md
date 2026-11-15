# NoteBooks Framework v2 Plan

This plan records the current direction and will be expanded as requirements are provided.

## Known direction

- Develop NoteBooks Framework v2 as a separate project inspired by NoteBooks-Framework.
- Keep the existing GitHub file-system conventions and API routes, including the raw and media paths.
- Replace the existing `GITHUB-REPOSITORIES.md` and `files.json` build sequence, which is not intended to scale to larger systems.
- Allow public account signup with a chosen account ID, email, and password; use Supabase Auth for credentials.
- Give each account a role, default new accounts to `user`, and enforce a single designated `admin`.
- Use Supabase to store repositories, responsible account IDs, latest commit SHAs, and last-updated dates.
- Exclude Issues and Community repositories from the current scope; they should only be stored in Supabase if added in a later phase.
- Populate a database-backed file tree from each repository's `files.json`, recording file names, relative paths, and file SHAs.
- Organize the tree conceptually as `root -> class/stream -> repo -> files`.
- On repository updates, add new files and update the stored SHA when an existing file's SHA changes.
- Use one shared database table, not a separate table per repository. Alphabetize its fields, and give every record a unique ID linked to its repository.
- Ensure all generated tree JSON files can be deleted and recreated from the database.
- Create a shared repository-list configuration file specifying which repositories and branches to pull. It will be editable in the admin dashboard and read-only when available on the website, following the role of `GITHUB-REPOSITORIES.md` in NoteBooks-Documents.
- Generate five section indexes (including one combined Lower Secondary group) and one `github_repositories` index from database state; publish keyed JSON and JSONL for each logical index.
- Serve the generated indexes through cacheable Next.js routes backed by Redis rather than writing to the deployment filesystem.
- Add a responsive non-rendering browser interface for all six indexes, with local theme preferences and last-file restoration tied to a random browser session ID.

## Database-first implementation plan

Build and validate the database in small, reviewable migrations before adding the dashboard or automatic repository synchronization. Supabase Auth is the chosen credential provider; passwords belong only to Supabase Auth and never to application tables. The initial schema and import migrations are applied remotely; local Supabase validation remains outstanding.

1. **Agree on data ownership and row shape — decided.** Use one shared repository/file table containing a repository anchor row plus one linked row per file. Keep the account ID and role profile separate from that catalog and let Supabase Auth own credentials.
2. **Review the prepared schema.** Confirm alphabetized columns, primary/foreign keys, unique constraints, supported group values, required/optional fields, deletion behavior, and timestamps in [DATABASE.md](DATABASE.md).
3. **Implement identity and role metadata.** Connect Supabase Auth users to unique chosen account IDs and roles. New signups receive the ordinary role; provision exactly one admin through a trusted operator-only procedure. Define RLS before allowing application access.
4. **Apply and verify the initial migration — applied remotely.** The configured remote project was reset and the account/profile and repository/file schema applied. Signup, duplicate IDs, role defaults, RLS, and admin promotion still need application-level tests.
5. **Import repository configuration and initial files — completed.** Added the v2 registry and TypeScript importer; imported 11 enabled non-Issues/Community repos and their file SHAs into the configured remote Supabase project.
6. **Test incremental data operations.** Add/change/remove files, verify SHA updates and constraints, and confirm ordinary users cannot read or modify protected repository data.
7. **Build tree generation from database state — implementation complete, publication pending Redis configuration.** Generate five section indexes and the repository registry in keyed JSON and JSONL; rebuild only the affected section after repository file sync. Configure Redis and verify the full import/rebuild path against the remote catalog.
8. **Add synchronization after the schema is stable — signed fast path implemented.** Generate manifest SHAs with `share/fmtree.py`; call the signed repository-update endpoint from GitHub Actions; add scheduled/manual SHA reconciliation as the fallback. Verify retries are idempotent and cache failures can be retried.
9. **Add account API keys and Markdown downloads — implementation and migration complete.** Create account-owned, hash-only API keys; rate-limit downloads per key; resolve catalog files, fetch pinned content, verify Git blob SHAs, and cache content by SHA. Exercise the full flow with a signed-in account.
10. **Add the admin UI and production hardening.** Manage repository configuration through protected Next.js routes; then review secrets, deployment configuration, backups, migration rollback/recovery, and existing raw/media API compatibility.
11. **Build the browser library — in place.** Home and five library routes consume public indexes, expose search and source links, and save themes plus last-work in a browser-local session.
12. **Integrate the Markdown reader — initial integration complete.** Double-click opens a reader overlay. Next.js owns fetching, the reader controls, outline, raw-source toggle, speech, and themes; the legacy browser renderer still handles Markdown-it/Obsidian syntax, MathJax, Mermaid, TikZJax, Desmos, and highlighting through lazy-loaded CDN/runtime scripts. The public raw/media routes resolve through Redis indexes, validate catalog membership, and verify Git blob SHAs; media also resolves verified Git LFS objects. DOMPurify sanitizes generated HTML before insertion. Continue validating diagrams/embeds with representative repositories, then gradually migrate self-contained renderer utilities into typed modules.

## Current decisions and open questions

- **Decided:** use Supabase Auth for email/password credentials, with a chosen account ID as the human-facing login ID.
- **Decided:** ordinary signups get a user role; only one account is the admin.
- **Decided:** use one shared repository/file catalog table, not a database table per repository. It will have one repository anchor row plus one linked row per file; this preserves empty repositories and stores file SHAs as queryable rows.
- **Decided:** `account_id` on a repository anchor means the app account responsible for that repository; GitHub ownership is tracked separately by `repo_owner`.
- **Decided:** delete file rows when files disappear from an active upstream manifest; archive repositories removed from the active registry and retain their metadata and file rows.
- **Completed:** imported 11 repository anchors and 839 file rows. All 839 stored file SHAs passed the 40-character SHA check; Community and Issues were excluded as requested. Initial repository `account_id` fields are null pending account signup/assignment.
- **Open before repository implementation:** confirm the repository-list format and whether the public registry is served from a protected database view or generated file.
- **Open before deployment:** configure the production `WEBSITE_URL` and matching `WEBHOOK_SECRET` GitHub Actions secrets, then choose a reconciliation cadence; polling should still detect missed updates.
- **Completed:** reset the configured remote Supabase project and applied all four schema/import migrations. Auth users, Storage buckets, and application accounts remain empty; the repository catalog now contains 11 anchors and 839 files.
- **Completed:** added portable manifest SHA generation and reusable `fmupdate.yaml`/`fmwebhook.yaml` templates under `share/`, plus an HMAC-authenticated repository update endpoint. Scheduled reconciliation and end-to-end remote webhook verification remain outstanding.
- **Completed:** added per-repository FIFO QStash delivery for GitHub updates. Each repository's jobs serialize while different repositories may process concurrently; the QStash worker verifies signed deliveries and retries processing failures.
- **Completed:** added account-owned API-key issuance/list/revocation routes and a rate-limited Markdown download endpoint with commit-pinned SHA verification and Redis caching. The additive API-key migration is applied to the configured Supabase project.
- **Completed:** added the responsive browser library with Lower Secondary (Class 9 and Class 10), Science, Commerce, Humanities, and Developers. A random browser session ID scopes local theme and last-work preferences; it does not authenticate the user.

See [DATABASE.md](DATABASE.md) for the working schema proposal and the commit-update workflow. Revise that proposal as each decision is confirmed, then implement the matching migration.
