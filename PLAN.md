# NoteBooks Frameworks — v2.x Roadmap

Site: notebooks-frameworks.vercel.app

Each phase is one version line. Approve a phase, then say "continue" to start the next.

Sources merged into this roadmap:
- **FW-v2** = "NoteBooks Framework v2 Plan" (database-first backend, steps 1–12)
- **RD-v3** = "PLAN v3: Reader redesign + renderer in Next.js" (phases 0–8)

Checklist key: `[x]` done (status checked against the repository and test suite on 2026-11-19), `[ ]` still open.

## Summary

| Version | Theme | Status | Depends on |
|---|---|---|---|
| v2.0.x | Next.js migration: database-first backend, library, reader, `/developers` shell | Mostly done; verification and migrations open | none |
| v2.1.x | Renderer upgrades (Desmos, MDX R&D, typed renderer modules, AI "explain this" backend) | In progress; Desmos and AI chat are implemented, MDX/TikZ verification remains | v2.0 |
| v2.2.x | Admin dashboard and control centre | Initial console done; hardening open | v2.0 (sessions) |
| v2.3.x | User/account update + Usage Policy | Identity code done, migration pending | v2.0, v2.2 |
| v2.4.x | API/CLI use update (API docs in `/developers`) | API keys + downloads done; docs, CLI open | v2.3 |
| v2.5.x | Community/chat update (Discord webhook or similar) | Not started | v2.3, v2.1 (AI) |

**Repository verification (2026-11-19):** `pnpm test` passed (173 tests across 44 files), `pnpm typecheck` passed, `pnpm build` passed, and `pnpm lint` passed with 0 errors (6 warnings). The performance pass added short-lived parsed-index caching with concurrent-request deduplication, navigation prefetch on explicit open intent, a reader rendering overlay, and reduced-motion-aware stream-page entrance animations. Vercel Speed Insights is wired into the root layout for Vercel deployments; PDF page-mode preferences and the embedded NoteBooks AI Assistant were validated in a production browser smoke test. Security review found no exploitable vulnerabilities. This verifies the local automated setup, not production migrations, live provider quotas, or deployment secrets.

---

## Developers section (`/developers`)

Public in production: dev docs, API docs, and the R&D currently going on in the project.

**Content source:** bound to the **NoteBooks-Developers** repository. Pages are fetched from that repo (same pattern as the notes repos), so docs and R&D write-ups are updated by committing to it, not by redeploying the site.

- [ ] Confirm this is the same thing as the existing **Developers** stream in the library (the five library sections are Lower Secondary, Science, Commerce, Humanities, Developers), or decide how `/developers` and that stream relate

**Structure**
- `/developers/docs`: stable documentation
- `/developers/api`: API docs (added in v2.4.x)
- `/developers/rnd`: experiments, each marked **Experimental** with a status (Testing / Working / Parked) and the version it targets
  - `/rnd/desmos`, `/rnd/tikz`, `/rnd/mermaid`, `/rnd/mdx`

**Rules**
- R&D pages use the same components and compile path as production, so a passing test means it works in the reader.
- Never compile visitor-written MDX on the server. Only compile files from the repos. A playground, if added, runs fully in the browser.
- Do not publish internals: admin routes, env var names, internal endpoints, key-routing details.
- Anything that costs money (AI demo) uses the same Turnstile + Upstash rate limits as the reader.
- Each renderer loads its library only on its own page, so docs stay fast.
- Pages that are unstable or broken get `noindex`; stable docs are indexed.

**R&D checklists**
- **Desmos:** several graphs per page, graph inside a note, resize, light/dark switch, load time.
- **TikZJax:** simple and heavy diagram, client-side only, time to appear, does not block the page. (RD-v3 found no usable TikZ fixture in the sampled libraries, so TikZ parity is still unverified.)
- **Mermaid:** flowchart and mindmap, zoom and drag, dark-theme colours.
- **MDX/React:**
  - Sample note with a quiz, reveal-answer button, sortable table
  - Breakage set: LaTeX with `{}`, `a < b`, chemistry formulas, deliberate error (confirms fallback to the normal parser)
  - One real chapter (Gravitation or Structure of Atom), unchanged
  - Compile time cold vs cached

---

## v2.0.x — Next.js Migration (database-first backend, library, reader)

**Goal:** the site runs on Next.js with a Supabase-backed catalog, generated indexes, a browser library and the new reader. The existing GitHub file-system conventions and the raw/media API routes are kept. `GITHUB-REPOSITORIES.md` and the `files.json` build sequence are replaced.

### FW-v2 data and backend steps

- [x] 1. Data ownership and row shape decided: one shared repository/file table (repository anchor row + one linked row per file); account ID and role profile separate; Supabase Auth owns credentials
- [ ] 2. Review the prepared schema in `DATABASE.md`: alphabetized columns, primary/foreign keys, unique constraints, group values, required/optional fields, deletion behaviour, timestamps
- [ ] 3. Identity and role metadata
  - [x] Code for GitHub identity capture, verified browser-session binding, OAuth User ID / User Name setup, immutable User IDs, editable User Names
  - [ ] **Apply migration `20261117090000_account_identity_and_sessions.sql`** to the configured Supabase project before deploying
  - [ ] Define RLS before allowing application access
  - [ ] Provision exactly one `admin` through a trusted operator-only procedure; new signups default to `user`
- [x] 4. Initial migration applied remotely (remote project reset; account/profile and repository/file schema applied)
  - [ ] Application-level tests: signup, duplicate IDs, role defaults, RLS, admin promotion
  - [ ] Local Supabase validation
- [x] 5. Repository configuration and initial files imported (11 repositories, 839 file rows, all SHAs passed the 40-character check; Issues and Community excluded)
  - [ ] Initial repository `account_id` fields are null: assign after account signup
- [ ] 6. Test incremental data operations: add/change/remove files, SHA updates, constraints, ordinary users cannot read or modify protected repository data
- [ ] 7. Tree generation from database state (five section indexes + `github_repositories`, keyed JSON and JSONL; implementation complete)
  - [ ] Configure Redis and verify the full import/rebuild path against the remote catalog
  - [ ] Confirm all generated tree JSON can be deleted and recreated from the database
- [ ] 8. Synchronization (signed fast path implemented: `share/fmtree.py`, `fmupdate.yaml`/`fmwebhook.yaml` templates, HMAC-authenticated update endpoint, per-repository FIFO QStash delivery)
  - [ ] Set production `WEBSITE_URL` and matching `WEBHOOK_SECRET` GitHub Actions secrets
  - [ ] Scheduled/manual SHA reconciliation as the fallback; choose the cadence
  - [ ] Verify retries are idempotent and cache failures can be retried
  - [ ] End-to-end remote webhook verification
- [x] 11. Browser library in place (home + five section routes, search, source links, local theme and clearable history tied to a random browser session ID; streams start at the repository list)
- [x] 12. Markdown reader integrated (double-click overlay; Next.js owns fetching, controls, outline, raw toggle, speech, themes; public raw/media routes verify catalog membership and Git blob SHAs; LFS media resolved; DOMPurify on generated HTML)
  - [ ] Validate diagrams/embeds with more representative repositories (continues in v2.1.x)
- [ ] Open decision: confirm the repository-list format and whether the public registry is served from a protected database view or a generated file
- [ ] Open decision: shared repository-list config file (which repos/branches to pull): editable in the admin dashboard, read-only on the website

### RD-v3 reader redesign phases

- [x] Phase 0: baseline (reference-note screenshots in `design/reader-baseline/`; Mermaid used as the diagram substitute because no TikZ fixture existed)
- [x] Phase 1: renderer core (`renderNote` pure module: nested section tree, `searchIndex`, callout mapping, server-side KaTeX; tests on reference notes)
- [x] Phase 2: Next.js shell (reader route, GitHub fetch with caching, TikZJax client-only, theme/outline state before paint)
- [x] Phase 3: layout, tokens, type, spacing, brackets (contrast tests pass for every theme in light and dark; 390px mobile has no horizontal overflow)
- [x] Phase 4: components (tables, KaTeX, code, Mermaid verified; all 28 diagrams in the diagram reference rendered)
  - [ ] Visual TikZ parity unverified (no fixture)
- [x] Phase 5: outline window and navigation, using the documented fallback (notes scroll drives the outline; outline click jumps to notes; continuous outline-pane scrolling does not drive the notes)
  - [ ] TikZ-after-render outline behaviour not fixture-tested
- [x] Phase 6: search (Outline and Notes modes, wildcards `*` and `?`, grouped results, highlights, Enter / Shift+Enter)
- [x] Phase 7: AI panel and backend (selected text and relevant note context, local chat history, usage/privacy consent, rate limiting, token accounting, and selectable Low/Medium/High/Extra effort tiers)
- [x] Phase 8: extras (per-note progress, font scaling, sepia, print, mobile outline drawer)
- [x] Mermaid runtime ownership and sizing (server emits placeholders; client renders SVG + pan/zoom; mindmaps tagged from source; readable-label fit)
- [x] Responsive panel spacing (Chat becomes a corner button/overlay below 1600px; Outline becomes a drawer below 1100px)
- [x] Final validation: 169 tests passed, TypeScript and production build passed, lint with 0 errors (6 warnings)

### Added in this roadmap

- [ ] `/developers` shell bound to the NoteBooks-Developers repo, with the R&D page skeletons

**Done when:** the reader and library run on Next.js with no feature loss, GitHub login actually logs a user in, the identity migration is applied, Redis is configured, and the import/rebuild path is verified against the remote catalog.

---

## v2.1.x — Markdown Renderer Upgrades and Migration

**Goal:** a better renderer, then the AI helper.

- [x] v2.1.1: **Desmos renderer** (separate 2D/3D DSL compilers wired into the reader and official Desmos SDK; source diagnostics and malformed-graph overlays; read-only expressions with interactive sliders; focused compiler tests pass)
- [ ] Gradually migrate self-contained legacy renderer utilities (Markdown-it/Obsidian syntax, MathJax, Mermaid, TikZJax, Desmos, highlighting, currently lazy-loaded CDN/runtime scripts) into typed modules (FW-v2 step 12)
- [ ] Verify TikZ with a real fixture (RD-v3 gap)
- [ ] MDX decision, based on the `/developers/rnd/mdx` results:
  - Compile on the server (e.g. `next-mdx-remote` RSC), cache by file SHA (Upstash or Next cache), fall back to the plain Markdown parser on error
  - `.md` stays the default; `.mdx` is opt-in per file
  - Start with 3 to 5 components (quiz, reveal answer, sortable table, callout, step-through), using directives or MDX, whichever the R&D shows is safer
  - Components passed through an allowlist
- [x] **AI "explain this" backend** at `/api/ai/chat`: Groq integration, relevant note/selection context, local history, and model metadata shown on replies
  - [x] Low / Medium / High / Extra effort tiers select server-enforced model and output ceilings; note excerpts and history are fitted to approximate input budgets
  - [x] Rate limits in Upstash Redis for anonymous IP/browser and authenticated accounts
  - [ ] Verify live provider limits and real-world token usage; input fitting is approximate and tier-specific daily quotas/shared model cooldowns are not implemented
- [x] Short AI usage/privacy policy pages before enabling chat
- [ ] Publish each finished R&D result in `/developers/rnd`
- [ ] RD-v3 open questions
  - [ ] What callout syntax do the notes use today (so each type maps to `data-type`)?
  - [ ] Revision mode that closes worked solutions by default?
  - [ ] Equations searchable in Notes mode? (planned no for v1)
- [ ] Parked: chapter mindmaps (Map tab in the left rail; needs a check of how Mermaid exposes mindmap nodes)
- [ ] Parked: continuous two-way scroll sync (outline-pane scrolling driving the notes), if the fallback proves limiting

**Done when:** Desmos blocks render reliably, the MDX decision is made with measured results, and live provider limits and token usage are verified against the tier budgets.

---

## v2.2.x — Admin Dashboard and Control Centre

**Goal:** control over everything before opening the site up further.

- [x] Private `/admin` console (FW-v2 step 10): one-time admin bootstrap, repository CRUD/archive/restore and account assignment, manual QStash checks, index rebuild, privacy-preserving API/page metrics, service health, bounded sync-run history, admin audit trail
- [ ] Apply the admin and AI provider key migrations, configure production secrets
- [ ] Keep the bootstrap `GITHUB-REPOSITORIES.md` manifest aligned with the admin-managed Supabase catalog
- [x] Scheduled SHA reconciliation (daily GitHub Actions workflow and secret-protected route enqueue the existing idempotent worker; configure secrets and verify a live run)
- [ ] Remote webhook verification
- [ ] Verify managed backups and rehearse restore/recovery (runbook documented; live backup/restore remains unverified)
- [x] View AI usage per key and rate-limit state; ability to disable a key (code complete; apply the AI provider key migration before production use)
- [ ] Content controls (what the reader and `/developers` fetch, cache refresh)

**Done when:** you can see and change the main parts of the site without touching the database by hand.

---

## v2.3.x — User/Account Update

**Goal:** real accounts and a proper policy.

- [x] Account page/profile and GitHub/Discord connected-login controls (code complete; configure external providers and verify the flows)
- [ ] Account setup flow tested end to end (suggested GitHub username, permanent User ID, editable User Name)
- [ ] Per-user AI rate limits (replaces the IP-based limits from v2.1)
- [ ] Full Usage Policy, Terms, Privacy Policy
- [ ] Account deletion / data export

**Done when:** every limit and permission is tied to a user, and the policies are published.

---

## v2.4.x — API / CLI Use Update

**Goal:** a documented `/api/` path.

- [x] Account-owned, hash-only API keys (issue/list/revoke); rate-limited Markdown download endpoint with commit-pinned SHA verification and Redis caching; additive migration applied (FW-v2 step 9)
- [ ] Exercise the full flow with a signed-in account
- [ ] API docs published in `/developers/api` (from the NoteBooks-Developers repo)
- [ ] CLI login (device-code or token flow) and CLI browsing
- [ ] Single and bulk md/pdf delivery through raw/media paths
- [ ] Rate limits and abuse protection across all of `/api/`
- [ ] Optional: CLI markdown renderer

**Done when:** a logged-in user can fetch notes from the terminal using documented endpoints.

---

## v2.5.x — Community / Chat Update

**Goal:** community chat using something like a Discord webhook.

- [ ] Decide the design first. A Discord **webhook only sends** messages from the site into a Discord channel. Reading Discord messages back onto the site needs a bot, or a different chat service. Option: site-only chat in Upstash Redis, with the webhook as a one-way mirror to Discord.
- [ ] Chat messages from the site posted through the webhook
- [ ] Cooldown per user/IP; Turnstile for anonymous messages
- [ ] AI bot triggered by chat messages, with its **own quota** so chat cannot use up the reader's AI keys
- [ ] Moderation: admin controls from v2.2, report/mute

**Done when:** users can chat, abuse is limited, and the AI quota for the reader is protected.

---

## Cross-cutting rules

- Passwords belong only to Supabase Auth, never to application tables.
- Auth sessions are fixed in v2.0 and never revisited later.
- Issues and Community repositories stay out of scope unless added in a later phase.
- The Usage Policy is short in v2.1, full in v2.3.
- Every external call (AI, webhook, API) has a rate limit before it ships.
- Generated tree JSON can always be deleted and rebuilt from the database.