import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const inventoryPath = path.join(root, 'docs/phase1/FILE-INVENTORY.tsv');
const rows = fs.readFileSync(inventoryPath, 'utf8').trim().split(/\r?\n/).slice(1).map((line) => {
  const [file, bytes, extension, area] = line.split('\t');
  return { file, bytes: Number(bytes), extension, area };
});

const exact = new Map([
  ['./README.md', ['Project documentation', 'Maintainer', 'active', 'Project overview and setup guidance', 'Keep; landing page links locally.']],
  ['./GITHUB-REPOSITORIES.md', ['Content configuration', 'Content pipeline', 'active', 'Configured stream repositories and branches', 'Keep; canonical generator input.']],
  ['./files.json', ['Local content manifest', 'Local content delivery', 'active', 'Local workspace tree for landing and local file browsing', 'Keep; canonical landing manifest input.']],
  ['./index.html', ['Landing shell', 'Frontend shell', 'active', 'Home page, stream cards, local-document mount, and shared overlays', 'Keep; split only if later responsibilities become independently owned.']],
  ['./offline.html', ['PWA shell', 'Frontend shell', 'active', 'Offline fallback page', 'Keep; align with stream/settings navigation.']],
  ['./service-worker.js', ['PWA runtime', 'Frontend runtime', 'active', 'Cache, offline fallback, stream artifact and raw-file behavior', 'Keep; canonical generated worker.']],
  ['./package.json', ['Build configuration', 'Build system', 'active', 'Scripts, package entrypoints, and dependency contract', 'Keep; single package contract.']],
  ['./package-lock.json', ['Dependency lockfile', 'Build system', 'active', 'Deterministic npm dependency resolution', 'Keep; regenerate only through npm.']],
  ['./tsconfig.json', ['TypeScript configuration', 'Build system', 'active', 'Shared compiler defaults', 'Keep.']],
  ['./tsconfig.client.json', ['TypeScript configuration', 'Build system', 'active', 'Client compilation graph', 'Keep; source of public client outputs.']],
  ['./tsconfig.client.compat.json', ['Compatibility build configuration', 'Build system', 'compatibility', 'Legacy client compiler configuration', 'Review after client graph is stable.']],
  ['./tsconfig.server.json', ['TypeScript configuration', 'Build system', 'active', 'Server compilation graph', 'Keep.']],
  ['./vercel.json', ['Deployment configuration', 'Deployment', 'active', 'Vercel routing and function deployment', 'Keep; reconcile with Node server routes.']],
  ['./Dockerfile', ['Deployment configuration', 'Deployment', 'active', 'Container build/runtime configuration', 'Keep if container deployment remains supported.']],
  ['./docker-compose.yml', ['Development infrastructure', 'Deployment', 'optional', 'Local service orchestration', 'Keep as optional developer environment.']],
  ['./version.json', ['Generated build metadata', 'Build system', 'generated', 'Build version/hash metadata', 'Regenerate; never hand-edit.']],
  ['./favicon.png', ['Brand asset', 'Frontend shell', 'active', 'Browser/favicon branding', 'Keep.']],
  ['./installer.html', ['Installer shell', 'Deployment/onboarding', 'optional', 'Installation/onboarding UI', 'Audit separately; do not merge into landing shell without decision.']],
  ['./fmtree.py', ['Local manifest generator', 'Local content delivery', 'active', 'Generates root files.json for landing-page documentation; optional --registry is explicit', 'Keep; run from npm build and the local-manifest workflow.']],
  ['./zipCreate.sh', ['Release utility', 'Maintenance tooling', 'optional', 'Project archive packaging helper', 'Keep if release workflow uses it; otherwise retire.']],
  ['./scripts/build-file-responsibility-manifest.mjs', ['Responsibility manifest generator', 'Project governance', 'active/tooling', 'Generates the deterministic file-responsibility manifest and JSON classification', 'Keep; rerun whenever files or ownership boundaries change.']],
  ['./LICENSE', ['Legal metadata', 'Project governance', 'active', 'License text', 'Keep.']],
  ['./.env', ['Environment configuration', 'Deployment/configuration', 'secret/local', 'Local environment variables and secrets; never committed or packaged', 'Exclude from handoff and source control.']],
  ['./.gitignore', ['Repository hygiene', 'Project governance', 'active', 'Excludes secrets, dependencies, build outputs, and local artifacts', 'Keep; update when revamp changes generated paths.']],
  ['./.github/workflows/ci.yml', ['CI workflow', 'CI/CD', 'active', 'Continuous integration checks', 'Keep; update paths after revamp.']],
  ['./.github/workflows/deploy-staging.yml', ['Deployment workflow', 'CI/CD', 'active', 'Staging deployment automation', 'Keep; verify deployment entrypoint.']],
  ['./.github/workflows/fmmupdate.yaml', ['Automation workflow', 'CI/CD', 'optional', 'Manifest/content update automation', 'Keep only if still invoked; verify before removal.']],
  ['./.github/workflows/integration.yml', ['Integration workflow', 'CI/CD', 'active', 'Integration test automation', 'Keep; update paths after revamp.']],
  ['./.github/workflows/notify-app-example.yml', ['Notification workflow', 'CI/CD', 'optional', 'External/example notification automation', 'Review secrets and invocation before retaining.']],
  ['./api/[...all].ts', ['Vercel API adapter', 'Deployment', 'active/compatibility', 'Serverless catch-all adapter into the Node API composition', 'Keep; reconcile with src/server/server.ts.']],
  ['./api/community/feed.ts', ['Vercel API adapter', 'Deployment', 'dormant/guarded', 'Serverless community feed adapter', 'Retain with community feature; do not merge into stream tree API.']],
  ['./api/system/[stream].ts', ['Vercel API adapter', 'Deployment', 'active/compatibility', 'Serverless stream tree adapter', 'Keep; canonical handler remains src/api/system.ts.']],
  ['./api/system/[stream]/refresh.ts', ['Vercel API adapter', 'Deployment', 'active/compatibility', 'Serverless signed stream refresh adapter', 'Keep; canonical handler remains src/api/system.ts.']],
  ['./logs/admin-actions.log', ['Runtime log', 'Operations', 'generated/local', 'Local administrative action log', 'Exclude from source handoff; rotate or externalize in deployment.']],
]);

const api = {
  '_shared.ts': ['Shared integration layer', 'Server integration', 'active', 'GitHub/config/repository helpers shared by APIs', 'Keep; split only by integration boundary.'],
  'admin.ts': ['Admin API', 'Admin feature', 'dormant/guarded', 'Administrator actions and security checks', 'Retain dormant; do not merge into public stream API.'],
  'auth.ts': ['Authentication API', 'Identity feature', 'dormant/guarded', 'Registration, login, reset, tokens, and email flows', 'Retain for later sign-in.'],
  'blob.ts': ['Blob API', 'Storage feature', 'dormant/guarded', 'Blob/upload-related endpoint behavior', 'Retain; separate from raw read delivery.'],
  'community.ts': ['Community API', 'Community feature', 'dormant/guarded', 'Posts, moderation, discussions, and subject metadata', 'Retain; subject fields are not stream terminology.'],
  'config.ts': ['Runtime config API', 'Server configuration', 'active', 'Environment-backed client configuration and permissions', 'Keep; centralize future settings separately.'],
  'desmos.ts': ['Desmos integration API', 'Optional integration', 'dormant/guarded', 'Desmos calculator proxy/integration', 'Retain isolated; no stream ownership.'],
  'files-manifest.ts': ['Local manifest API', 'Local content delivery', 'active', 'Builds/serves local files.json-compatible manifests', 'Keep; landing/local browsing owner.'],
  'forum.ts': ['Forum API', 'Community feature', 'dormant/guarded', 'Forum router and community operations', 'Retain dormant; do not merge with stream read APIs.'],
  'gh.ts': ['GitHub API', 'GitHub integration', 'dormant/guarded', 'Authenticated repository/blob operations', 'Retain; distinct from public raw delivery.'],
  'github-app.ts': ['GitHub App API', 'GitHub integration', 'dormant/guarded', 'GitHub App installation/merge behavior', 'Retain isolated.'],
  'oauth.ts': ['OAuth API', 'Identity feature', 'dormant/guarded', 'OAuth provider flow', 'Retain for future sign-in.'],
  'pages-fetch.ts': ['Pages manifest fetcher', 'Content pipeline', 'compatibility', 'Pages/raw files.json fallback fetching', 'Keep as fallback; canonical generation owner is scripts/json-fetch.ts.'],
  'pr-review.ts': ['PR review API', 'Editor/moderation feature', 'dormant/guarded', 'Review, accept, and reject operations', 'Retain dormant.'],
  'raw.ts': ['Raw file API', 'Stream content delivery', 'active', 'Validated raw GitHub URL/file delivery for previews/downloads', 'Keep as dominant file-click delivery owner.'],
  'refresh-signal.ts': ['Refresh signal API', 'Content pipeline', 'active', 'Signed refresh signals and cache invalidation notifications', 'Keep; do not merge with generation.'],
  'repo-registry.ts': ['Repository registry API', 'Content pipeline', 'active/compatibility', 'Parses registry configuration and serves canonical registry fallback', 'Keep; canonical generated artifact is primary.'],
  'submit-pr.ts': ['Submission API', 'Editor feature', 'dormant/guarded', 'Authenticated content PR submission', 'Retain; subject fields remain separate.'],
  'system.ts': ['Stream tree API', 'Stream content delivery', 'active/compatibility', 'Serves canonical stream trees with signed refresh fallback', 'Keep; use stream terminology.'],
  'totp.ts': ['TOTP API', 'Identity/security feature', 'dormant/guarded', 'TOTP enrollment, verification, and disablement', 'Retain for later sign-in/security.'],
  'webhooks/github-app.ts': ['GitHub App webhook API', 'GitHub integration', 'dormant/guarded', 'Webhook validation and GitHub App events', 'Retain isolated.'],
};
const lib = {
  'ai-markdown.ts': ['AI Markdown renderer', 'Content rendering', 'optional', 'AI-assisted Markdown transformation/rendering', 'Retain isolated; no stream registry ownership.'],
  'db.ts': ['Database adapter', 'Persistence', 'dormant/guarded', 'Postgres connection/migration/query lifecycle', 'Retain for identity/community phases.'],
  'github-app.ts': ['GitHub App library', 'GitHub integration', 'dormant/guarded', 'Reusable GitHub App client helpers', 'Retain isolated.'],
  'metrics.ts': ['Metrics library', 'Operations', 'optional', 'Application metrics helpers', 'Retain if telemetry is enabled.'],
  'permissions.ts': ['Permission middleware', 'Identity/security feature', 'dormant/guarded', 'JWT/session/TOTP/admin authorization checks', 'Retain; never couple to public stream reads.'],
  'runtime-config.ts': ['Runtime configuration library', 'Server configuration', 'active', 'Server-side environment/config resolution', 'Keep; avoid duplicate config readers.'],
  'shared-cache.ts': ['Shared cache library', 'Content pipeline', 'active/compatibility', 'Shared JSON/cache storage for stream trees and signals', 'Keep; separate from generation.'],
};
const scripts = {
  'cleanup-stale-src-js.js': ['Build cleanup script', 'Build system', 'active', 'Removes stale generated source JavaScript before builds', 'Keep if build remains dependent on it.'],
  'generate-json-files.ts': ['Canonical stream artifact generator', 'Content pipeline', 'active', 'Writes repo-registry.json and stream tree artifacts from fetched manifests', 'Keep as sole generator.'],
  'generate-stream-trees.js': ['Legacy stream generator', 'Content pipeline', 'dormant/legacy', 'Older stream tree generation path', 'Candidate for removal after reference scan.'],
  'generate-version.js': ['Build metadata generator', 'Build system', 'active', 'Writes version.json during builds', 'Keep.'],
  'json-fetch.ts': ['Repository manifest fetcher', 'Content pipeline', 'active', 'Fetches repository-root files.json and annotates exact paths/raw URLs', 'Keep as sole manifest fetcher.'],
  'migrate-db.js': ['Database migration runner', 'Persistence', 'dormant/guarded', 'Applies identity/community schema migrations', 'Retain for later identity/community phases.'],
};
const server = {
  'README.md': ['Server documentation', 'Server', 'active/reference', 'Server-specific architecture and operational notes', 'Keep; update with server composition changes.'],
  'api-routes.ts': ['API route registry', 'Server', 'active', 'Registers active and dormant API endpoints with their guards', 'Keep; preserve dormant feature routes until activation phases.'],
  'observability.ts': ['Observability routes', 'Operations', 'active', 'Request metrics, health checks, and version reporting', 'Keep; preserve response contracts.'],
  'public-routes.ts': ['Public route registry', 'Frontend shell', 'active', 'Registers landing, shell, stream, PWA, and static asset routes', 'Keep; preserve route precedence and static headers.'],
  'server.ts': ['Server composition root', 'Server', 'active', 'Cross-cutting middleware, module mounting, and lifecycle entrypoints', 'Keep as the only Express composition root.'],
  'startup.ts': ['Server startup support', 'Server', 'active', 'Development defaults, JSON artifact preparation, and stale fallback', 'Keep; preserve startup generation semantics.'],
  'workspace-routes.ts': ['Workspace route registry', 'Local content delivery', 'active', 'Local files.json, safe file delivery, and workspace metadata routes', 'Keep separate from remote stream artifacts.'],
};
const client = {
  'main.ts': ['Client entrypoint', 'Frontend runtime', 'active/compatibility', 'Client entrypoint/bootstrap compatibility layer', 'Keep only if referenced; otherwise consolidate with streams.ts.'],
  'streams.ts': ['Stream client controller', 'Frontend runtime', 'active', 'Stream route bootstrap, stream tree rendering, and file-click delegation', 'Keep; sole stream controller.'],
};
const publicJs = {
  'app.js': ['Main browser compatibility runtime', 'Frontend runtime', 'active', 'Navigation, workspace state, portal/activity, editor windows, and compatibility orchestration', 'Keep as bootstrap; extract remaining stateful boundaries only with focused tests.'],
  'theme.js': ['Theme browser runtime', 'Frontend runtime', 'active', 'Theme presets, persistence, token application, and Settings controls', 'Keep as canonical theme runtime; preserve compatibility globals.'],
  'landing-docs.js': ['Landing documentation runtime', 'Local content delivery', 'active', 'Loads files.json and renders allowlisted local README/architecture cards', 'Keep as canonical local landing-document loader.'],
  'stream-runtime.js': ['Stream runtime bridge', 'Stream feature', 'active', 'Loads canonical stream artifacts and exposes stream runtime compatibility APIs', 'Keep separate from academic subject data.'],
  'raw-delivery.js': ['Raw delivery browser runtime', 'Stream content delivery', 'active', 'Selects validated /api/raw delivery and compatibility fallbacks', 'Keep; raw API remains dominant file-click delivery path.'],
  'auth.js': ['Auth browser runtime', 'Identity feature', 'dormant/guarded', 'Client authentication UI/runtime', 'Retain for future sign-in.'],
  'config.js': ['Config browser runtime', 'Frontend runtime', 'active', 'Client config compatibility/bootstrap', 'Keep only for actual references.'],
  'markdown-editor.js': ['Markdown editor runtime', 'Editor feature', 'dormant/guarded', 'Editor UI and draft/submission helpers', 'Retain dormant.'],
  'markdown.js': ['Markdown preview runtime', 'Content rendering', 'active', 'Markdown rendering and preview helpers', 'Keep; separate from raw fetching.'],
  'md-init.js': ['Markdown initializer', 'Content rendering', 'active', 'Initializes Markdown dependencies/rendering', 'Keep; consider merge with markdown.js later.'],
  'mobile.js': ['Mobile workspace runtime', 'Frontend runtime', 'active', 'Mobile preview/workspace behavior', 'Keep; split only with test coverage.'],
  'modern-auth.js': ['Modern auth runtime', 'Identity feature', 'dormant/guarded', 'Modern auth UI helpers', 'Retain; avoid duplicate auth ownership.'],
  'obsidian-markdown-it.js': ['Markdown plugin bundle', 'Content rendering', 'active/vendor', 'Obsidian-style Markdown extensions', 'Keep vendored until dependency strategy changes.'],
  'upload.js': ['Upload runtime', 'Editor/storage feature', 'dormant/guarded', 'Upload UI and blob submission', 'Retain; separate from raw read.'],
};
const html = {
  'admin-prs.html': ['Admin PR shell', 'Admin feature', 'dormant/guarded', 'Admin pull-request review surface', 'Retain dormant.'],
  'admin.html': ['Admin wrapper shell', 'Admin feature', 'dormant/guarded', 'Legacy admin wrapper', 'Retain until admin shell consolidation.'],
  'adminX.html': ['Legacy admin shell', 'Admin feature', 'dormant/legacy', 'Older admin variant', 'Candidate for removal after route/reference verification.'],
  'community.html': ['Community wrapper shell', 'Community feature', 'dormant/guarded', 'Legacy community wrapper', 'Retain until community shell consolidation.'],
  'communityX.html': ['Legacy community shell', 'Community feature', 'dormant/legacy', 'Older community variant', 'Candidate for removal after route/reference verification.'],
  'settings.html': ['Settings shell', 'Settings feature', 'active', 'Theme controls and deferred sign-in boundary', 'Keep; extend later without coupling to auth.'],
  'streams.html': ['Stream workspace shell', 'Stream feature', 'active', 'Shared stream workspace HTML shell', 'Keep as canonical stream shell.'],
  'volunteers.html': ['Volunteer wrapper shell', 'Volunteer feature', 'dormant/guarded', 'Legacy volunteer wrapper', 'Retain until volunteer shell consolidation.'],
  'volunteersX.html': ['Legacy volunteer shell', 'Volunteer feature', 'dormant/legacy', 'Older volunteer variant', 'Candidate for removal after route/reference verification.'],
};
const css = {
  'community.css': ['Community styles', 'Community feature', 'dormant/guarded', 'Community-specific visual rules', 'Retain with community feature.'],
  'streams.css': ['Stream styles', 'Stream feature', 'active', 'Stream-specific tree and content styling', 'Keep; sole stream-specific stylesheet.'],
  'style.css': ['Shared application styles', 'Frontend shell', 'active', 'Landing, workspace, Settings, portal, and responsive styling', 'Keep; split later by page ownership after behavior stabilizes.'],
  'theme.css': ['Theme contract', 'Frontend shell', 'active', 'Global design tokens and theme surfaces', 'Keep as single token owner.'],
};

function classify(row) {
  if (exact.has(row.file)) return exact.get(row.file);
  const base = path.basename(row.file);
  if (row.file.startsWith('./api/')) return exact.get(row.file) || ['Vercel API adapter', 'Deployment', 'compatibility', 'Serverless adapter into the canonical server/API module', 'Keep only while deployment references it.'];
  if (row.file.startsWith('./src/api/')) return api[base] || ['Server API module', 'Server', 'review', 'Unclassified API handler', 'Review before revamp.'];
  if (row.file.startsWith('./src/lib/schemas/')) return ['Schema asset', 'AI/content feature', 'optional', 'JSON schema for flashcards, quizzes, or structured content', 'Retain if its consumer remains; otherwise remove with consumer.'];
  if (row.file.startsWith('./src/lib/')) return lib[base] || ['Server library', 'Server', 'review', 'Unclassified server library', 'Review before revamp.'];
  if (row.file.startsWith('./src/scripts/')) return scripts[base] || ['Build/runtime script', 'Build system', 'review', 'Unclassified script', 'Review before revamp.'];
  if (row.file.startsWith('./src/client/')) return client[base] || ['Client module', 'Frontend runtime', 'review', 'Unclassified client module', 'Review before revamp.'];
  if (row.file.startsWith('./src/db/')) return ['Database schema/migration', 'Persistence', 'dormant/guarded', 'Identity/community database structure', 'Retain for later identity/community phases.'];
  if (row.file.startsWith('./src/server/')) return server[base] || ['Server support module', 'Server', 'active', 'Server composition support module', 'Keep; mount explicitly from server.ts.'];
  if (row.file.startsWith('./src/service-worker.ts')) return ['Service-worker source variant', 'Frontend runtime', 'compatibility', 'TypeScript service-worker source', 'Reconcile with canonical service-worker.js before retaining both.'];
  if (row.file.startsWith('./src/shims/')) return ['Compatibility shim', 'Build system', 'compatibility', 'TypeScript/runtime compatibility adapter', 'Retain only while importer exists.'];
  if (row.file.startsWith('./src/types/')) return ['Type declaration', 'Build system', 'active/compatibility', 'Compiler type declaration', 'Keep while referenced.'];
  if (row.file.startsWith('./public/html/')) return html[base] || ['HTML shell', 'Frontend shell', 'review', 'Unclassified HTML page', 'Review route/references before revamp.'];
  if (row.file.startsWith('./public/js/')) return publicJs[base] || ['Browser asset', 'Frontend runtime', 'review', 'Unclassified browser JavaScript', 'Review references before revamp.'];
  if (row.file.startsWith('./public/css/')) return css[base] || ['Stylesheet', 'Frontend shell', 'review', 'Unclassified stylesheet', 'Review selectors/importers before revamp.'];
  if (row.file.startsWith('./public/json/')) return ['Generated stream artifact', 'Content pipeline', 'generated', 'Generated repo registry or stream-scoped tree', 'Regenerate; never hand-edit.'];
  if (row.file.startsWith('./public/fonts/')) return ['Font asset', 'Frontend shell', 'active/vendor', 'Bundled typography asset', 'Keep while referenced by theme.'];
  if (row.file.startsWith('./public/bin/tikzjax/')) return ['TikZ runtime asset', 'Content rendering', 'active/vendor', 'Vendored TikZ/WASM/TeX runtime and libraries', 'Keep while TikZ rendering is supported; do not merge with app code.'];
  if (row.file.startsWith('./public/client/')) return ['Generated client artifact', 'Build system', 'generated', 'Compiled client controller artifact', 'Regenerate from src/client; never hand-edit.'];
  if (row.file.startsWith('./public/')) return ['Public static asset', 'Frontend shell', 'active/vendor', 'Static browser/deployment asset', 'Keep if referenced; verify with asset reference scan.'];
  if (row.file.startsWith('./tests/')) return ['Automated test', 'Verification', 'active', 'Regression or integration test', 'Keep; rename only for domain clarity.'];
  if (row.file.startsWith('./logs/')) return ['Runtime log', 'Operations', 'generated/local', 'Local runtime log output', 'Exclude from source handoff and source control.'];
  if (row.file.startsWith('./.github/workflows/')) return ['CI/CD workflow', 'CI/CD', 'active/optional', 'Repository automation workflow', 'Keep active workflows; review optional workflows before removal.'];
  if (row.file.startsWith('./docs/')) return ['Project documentation', 'Project governance', 'active/reference', 'Architecture, plans, onboarding, or verification documentation', 'Keep; consolidate superseded docs after review.'];
  if (row.file.startsWith('./scripts/')) return ['Project utility', 'Maintenance tooling', 'review', 'Standalone maintenance/release utility', 'Review references before revamp.'];
  return ['Unclassified project file', 'Unassigned', 'review', 'No deterministic owner assigned yet', 'Must be reviewed before revamp.'];
}

const classified = rows.map((row) => ({ ...row, ...Object.fromEntries(['purposeClass', 'owner', 'status', 'responsibility', 'action'].map((key, index) => [key, classify(row)[index]])) }));
const unclassified = classified.filter((row) => row.owner === 'Unassigned' || row.status === 'review');
const out = [];
out.push('# File Responsibility Manifest');
out.push('');
out.push('This manifest is generated from `docs/phase1/FILE-INVENTORY.tsv`. It assigns every inventoried file a deterministic purpose class, owner, runtime status, responsibility, and revamp action. Generated artifacts and vendored assets are classified by ownership rules rather than treated as application source.');
out.push('');
out.push(`**Inventory size:** ${classified.length} files. **Files needing review before structural changes:** ${unclassified.length}.`);
out.push('');
out.push('| File | Bytes | Purpose class | Owner | Status | Responsibility | Revamp action |');
out.push('|---|---:|---|---|---|---|---|');
for (const row of classified) out.push(`| \`${row.file}\` | ${row.bytes} | ${row.purposeClass} | ${row.owner} | ${row.status} | ${row.responsibility.replaceAll('|', '\\|')} | ${row.action.replaceAll('|', '\\|')} |`);
out.push('');
out.push('## Revamp rules');
out.push('');
out.push('Files marked **active** are part of the current runtime or build path and may be reorganized only with a build and runtime verification gate. Files marked **dormant/guarded** remain available for future features and are not removed merely because their route is not currently visible. Files marked **generated** are outputs owned by a source generator and should never be hand-edited. Files marked **active/vendor** are third-party or binary assets whose responsibility is preservation, not application-level refactoring. Files marked **compatibility**, **optional**, or **dormant/legacy** require a reference scan and an explicit removal decision before deletion.');
out.push('');
out.push('## Canonical ownership boundaries');
out.push('');
out.push('| Concern | Canonical owner | Not allowed to duplicate |');
out.push('|---|---|---|');
out.push('| Stream repository manifest fetching | `src/scripts/json-fetch.ts` | Ad hoc manifest fetchers in browser code or duplicate generators |');
out.push('| Generated stream artifacts | `src/scripts/generate-json-files.ts` | Hand-edited JSON or legacy generator commands |');
out.push('| Runtime stream tree serving | `src/api/system.ts` | Subject-named public stream API implementations |');
out.push('| File preview/download delivery | `src/api/raw.ts` plus `public/js/app.js` orchestration | Direct-source code paths becoming first choice |');
out.push('| Local landing documentation | `fmtree.py` → `files.json` → `/files.json` → `public/js/landing-docs.js` | Stream registry data used for local project documentation |');
out.push('| Global theme tokens | `public/css/theme.css` and `public/js/theme.js` | Scattered page-wide color contracts |');
out.push('| Future sign-in | dormant auth/OAuth/TOTP modules | Settings page implementing its own identity flow |');

fs.writeFileSync(path.join(root, 'docs/phase1/FILE-RESPONSIBILITY-MANIFEST.md'), `${out.join('\n')}\n`);
fs.writeFileSync(path.join(root, 'docs/phase1/FILE-RESPONSIBILITY-MANIFEST.json'), JSON.stringify(classified, null, 2) + '\n');
console.log(`Wrote responsibility manifest for ${classified.length} files; ${unclassified.length} need review.`);
