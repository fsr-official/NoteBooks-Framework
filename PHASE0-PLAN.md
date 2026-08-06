# NoteBooks-Framework — Master Plan

> Supersedes BACKEND-CLEANUP-CHECKLIST.md and PLATFORM-UPGRADE-PLAN.md — everything from both, plus the GitHub Pages read-path and PR-review discussion, in one ordered plan. Phase 0 is this pass: unify auth (one identity system, actually wired, end to end), write it in strict TypeScript, and put a security/performance baseline under it. Everything after it — sidebar, search, GITHUB-REPOS.md, roles, PR review — waits.

---

## Open flags — current state, all of them

**Broken / misconfigured (Phase 0 — this pass):**

- /api/auth is not wired into the server at all — every login/signup/reset request 404s.
- submit-pr.ts requires accountId/accountToken, but markdown-editor.ts's "Submit PR" button sends neither — every PR submission fails too, and it was never connected to ModernAuth in the first place (two separate identity schemes, not one).
- The reCAPTCHA site key is hardcoded in modern-auth.ts instead of being served from /api/config.
- No .gitignore — node_modules and generated bin/*.js would get committed as-is.
- The node_modules shipped in the zip was corrupted (tsc could not find its own lib until reinstalled).
- src/backend/ is an empty leftover directory from an earlier naming pass.
- No startup validation — missing JWT_SECRET etc. fails on the first request, not at boot.
- GitHub write auth prefers a PAT over the already-implemented GitHub App auth — backwards from what you want.
- Client TypeScript build has 117 errors, only surviving because noEmitOnError: false; neither tsconfig has strict on.
- Env vars are undocumented across 6 files — moot for deployment since Vercel already holds them, but still worth one reference list so nobody has to grep for what's read where.
- No rate limiting, no helmet, no request-body validation anywhere.

**Missing / not built yet (Phase 1+):**

- No role/isAdmin field on the user object — needed before any admin panel can exist.
- User storage is ephemeral without KV_REST_API_URL/KV_REST_API_TOKEN configured — plain in-memory Map, wiped on every restart.
- No sidebar folder-tree navigation (sidebar currently holds only action buttons).
- No search bar.
- Multi-repo config is JSON (repo-registry.json), not the human-editable GITHUB-REPOSITORIES.md you want, and has no duplicate-file resolution policy.
- GITPAGE_URL is already read by both server and client but only used to detect "am I on the Pages domain" — not yet used to fetch content, so the free/public read-path isn't actually built.
- No PR-review admin panel — submit-pr.ts opens PRs but nothing in-app lists, diffs, or accepts/rejects them.
- No cap on open PRs per account — the existing cooldown slows spam but doesn't prevent a patient submitter from accumulating an unreviewed backlog.
- No caching or concurrency limit on the Octokit tree walk — will hit rate limits fast once GITHUB-REPOSITORIES.md has more than a couple of repos.
- No test suite, no CI, no rate limiting, no helmet, no request-body validation (zod).

That's the honest full list. Nothing here is urgent except Phase 0 — the rest is ordered so each phase has what it needs from the one before it.

---

## Phase 0 — This pass: unify auth, strict TypeScript, baseline hardening

Scope for this pass, deliberately narrow: one identity system, wired end to end, written in strict TypeScript, with a security/performance floor under it. Nothing from Phase 1/2 (sidebar, search, GITHUB-REPOSITORIES.md, PR-review panel, role field) happens in this pass.

### A. Housekeeping (unchanged, still first)

1. .gitignore: node_modules/, bin/*.js (keep bin/tikzjax/ and bin/fonts/), .env*, .vercel/, files.json.
2. Clean reinstall: rm -rf node_modules && npm install && npm run build — confirm it succeeds before touching anything else.
3. Delete src/backend/ — empty, unused.

### B. Auth unification — the actual point of this pass

1. Wire /api/auth into the server. Add src/api/auth.ts to tsconfig.server.json's include; in server.ts: app.all('/api/auth', authHandler).
2. Type auth.ts properly while it's being touched anyway (see §C for strict-mode rules) — it's currently untyped JS-in-a-.ts-file.
3. Serve the reCAPTCHA site key from /api/config instead of hardcoding it in modern-auth.ts: add RECAPTCHA_SITE_KEY: process.env.RECAPTCHA_SITE_KEY || '' to config.ts's response, have app.ts's existing config-fetch call ModernAuthInstance.setRecaptchaKey(...) from that instead of the <meta> tag lookup in auth.ts. One source of config truth, matches the pattern GITHUB_REPO etc. already use.
4. Make submit-pr.ts trust the same JWT ModernAuth issues — nothing else.
   - Delete verifyAccountAuthorization(), PR_AUTH_TOKENS, PR_AUTH_SECRET, and getAccountToken()'s body-token fallback entirely.
   - Require an Authorization: Bearer <token> header, jwt.verify(token, JWT_SECRET) it (same secret, same library, already a dependency), and use the decoded email as the account identity for the cooldown map and the PR body — never a client-supplied accountId string. This closes the current hole where anyone with a valid shared token could submit as any account name they chose, since there was never a valid shared token to begin with (submit-pr was unreachable) — but it's the correct fix regardless of that.
   - Return 401 with a clear message if the header is missing or invalid, instead of the current 'accountId and accountToken are required'.
5. Wire the client side to match:
   - In markdown-editor.ts's "Submit PR" handler, add headers: { Authorization: 'Bearer ' + ModernAuthInstance.getToken() } to the fetch('/api/submit-pr', ...) call.
   - Before allowing the submit action at all, check ModernAuthInstance.isLoggedIn(); if false, call showLoginScreen() (already defined in auth.ts) instead of firing the request. Right now the editor doesn't know or care whether anyone is logged in.
6. Fail-fast env check in server.ts before app.listen: require JWT_SECRET and GITHUB_REPO at minimum; process.exit(1) with a clear message if missing. Since Vercel already holds your env vars, this is a safety net for local/dev runs, not a deployment blocker.
7. GitHub write-auth precedence: in _shared.ts's getOctokit(), try App auth (GITHUB_APP_ID/GITHUB_APP_PRIVATE_KEY/GITHUB_APP_INSTALLATION_ID) before falling back to a PAT, logging a warning if the PAT path is ever hit. Set only the App credentials in your real env — no PAT.

### C. Strict TypeScript — for everything touched in this pass

1. Turn on "strict": true in tsconfig.server.json now. The server build is already clean under loose settings, and every file this pass touches (auth.ts, submit-pr.ts, _shared.ts) is small enough to type strictly from the start rather than retrofit later. Concretely for auth.ts: explicit Request/Response types on every handler, an explicit User interface ({ email: string; password: string; role: 'user'; createdAt: string; passwordResetAt?: string }) instead of untyped objects, explicit param/return types on every helper (getUser, setUser, verifyCaptcha, etc.).
2. Client TS cleanup (117 errors → 0) stays required before tsconfig.client.json can go strict — same four patterns as before, fix each once:
   - CDN globals (MathJax, mermaid, Desmos, hljs, grecaptcha, markdownit*) undeclared → one src/bin/globals.d.ts.
   - Custom DOM properties (_filePath, _isMarkdown, etc.) → one NoteElement interface, cast once at creation.
   - EventTarget/unknown narrowing → (e.target as HTMLElement) consistently in app.ts/mobile.ts/auth.ts/upload.ts.
   - Duplicate function implementations in app.ts/markdown.ts/mobile.ts — real runtime bugs, need an actual read-through.
   - Then noEmitOnError: true, and once clean, strict: true on tsconfig.client.json too.
3. Add scripts to package.json: typecheck: tsc --noEmit -p tsconfig.client.json && tsc --noEmit -p tsconfig.server.json.

### D. Security & performance — baseline for this pass

1. helmet() in server.ts — one line, sane default headers.
2. Rate limit /api/auth and /api/submit-pr specifically — the two endpoints that now actually work and are exactly the ones abuse-prone. express-rate-limit, tighter window on auth (login attempts) than on submit-pr (already has its own cooldown, but a hard outer ceiling is still worth it: e.g. 10 req / 15 min / IP as a backstop).
3. JWT expiry handling on the client. ModernAuth never checks token expiry or reacts to a 401 — add a shared response check (in _post()) that calls this._clearToken() and shows the login screen on any 401, instead of leaving the UI silently claiming "logged in" with a dead token.
4. Cache-Control on /api/config is already max-age=60 — fine as-is, no change needed, just confirming it's not part of the security gap (secrets aren't in that response, only public config).

**Verify this pass is done:**

npm run build && npm run typecheck
node src/server/server.js &
curl -s http://localhost:4000/health
curl -s -X POST 'http://localhost:4000/api/auth?action=register' -H 'Content-Type: application/json' -d '{"email":"test@example.com","password":"password123","confirmPassword":"password123"}'
# copy the returned token, then:
curl -s -X POST http://localhost:4000/api/submit-pr -H 'Content-Type: application/json' -H 'Authorization: Bearer <token>' -d '{"filePath":"test.md","content":"hi","originalContent":""}'
# should attempt a real PR (or a clean GitHub-side error), not "accountId and accountToken are required"
kill %1

---

## Phase 1 — Foundation features (read path + navigation)

Only start once Phase 0's verification passes clean.

- GitHub Pages read-path. Each storage repo gets a GitHub Actions workflow that builds a files.json manifest on push and deploys it via Pages. The framework fetches https://<org>.github.io/<repo>/files.json (tree) and raw file URLs directly — no Octokit, no rate limit, for reads. GITPAGE_URL is already plumbed through config.ts → app.ts; this phase is about actually consuming it for content, not just the domain check it does today.
- GITHUB-REPOSITORIES.md, replacing repo-registry.json: a markdown table (name | repo | branch | root | enabled | priority), checked top-to-bottom, priority breaking ties. Small parser in repo-registry.ts replaces JSON.parse.
- Duplicate-file resolution: keep the per-repo namespaced tree for the sidebar (no change needed there), and separately build a flat Map<normalizedPath, entry[]> across repos for search/canonical-lookup purposes. On collision: priority wins, ties broken alphabetically by repo name, every resolution logged, losing entries marked shadowedBy in the API response rather than silently dropped.
- Sidebar folder tree: new src/bin/sidebar-tree.ts, renders the same TreeNode[] the registry already produces, added as its own section in #appSidebar above the existing action buttons. Expand state in sessionStorage.
- Search (tier 1 only for now): a single input filtering the already-fetched tree client-side — no server round-trip, no rate-limit exposure. Content search (tier 2, via GitHub's code-search API) stays explicitly out of scope until this is proven out.

---

## Phase 2 — Write path + admin review (later, deferred as agreed)

Needs a role field on the user object, which this pass deliberately does not add — auth unification (Phase 0) comes first, roles come once there's an admin feature to gate.

- Add role: 'user' to auth.ts's created-user object, JWT payload includes role, a small Express middleware checks role === 'admin' on admin-only routes.
- PR-review panel: src/api/pr-review.ts — list open app-originated PRs (tag them at creation with a label or the existing pr/edit-* branch prefix), fetch diff via octokit.pulls.listFiles, accept/reject endpoints that require a non-empty note in the request body (validated server-side, not just UI-disabled), accept → octokit.pulls.merge + comment with the note, reject → close + comment with the reason. Both actions are permanently visible on the PR, which is the point — a submitter should always see why.
- Cap on open PRs per account alongside the existing cooldown in submit-pr.ts, so a patient submitter can't build an unreviewed backlog just by waiting out the rate limit.
- Persistent user storage: configure KV_REST_API_URL/KV_REST_API_TOKEN before this phase matters at all — an admin role is meaningless if the admin's account can vanish on a redeploy.

---

## Phase 3 — Testing, stress-testing, hardening, performance

- Vitest for repo-registry.ts's path/dedup logic (pure functions, cheap to cover exhaustively), then _shared.ts's auth precedence, then supertest-based integration tests for the API handlers with Octokit mocked.
- GitHub Actions CI: npm ci → typecheck → test → build on every PR.
- Registry caching: short-TTL cache (memory or the already-present Upstash Redis) in front of the Octokit tree walk, plus bounded concurrency (p-limit) instead of pure sequential recursion — matters most once GITHUB-REPOSITORIES.md has several repos.
- Load testing: autocannon/k6 against /api/registry, /api/raw, /api/gh — check cold-cache worst case, not just steady state.
- Security floor, continued: helmet() and auth/submit-pr rate limiting land in Phase 0 (this pass) — this phase extends the same pattern to /api/pr-review/* once it exists, adds zod schemas on every request body (gh.ts especially — five different action values, each with different required fields), and settles an explicit CORS policy instead of today's inconsistency (raw.ts wide open, everything else unset).
- Performance: bundle client scripts with esbuild instead of 11+ unbundled <script> tags, lazy-load MathJax/mermaid/Desmos/hljs only when a document actually needs them, long max-age on genuinely static assets (bin/tikzjax/, bin/fonts/).

---

## Why this order

Phase 0 fixes things that are actively broken right now regardless of what gets built next — there's no version of the future where a dead /api/auth or a PAT you didn't want is correct. Phase 1 is the free/cheap win (Pages read-path removes the rate-limit problem before it's even been hit) plus the navigation you need day-to-day. Phase 2 waits deliberately — an admin panel gating on a role field that only exists in an ephemeral in-memory Map is worse than not having it yet. Phase 3 is polish that's easiest to validate once there's a feature-complete app to point it at.
