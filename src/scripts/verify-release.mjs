import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const failures = [];

async function readJson(relativePath) {
  const absolute = path.join(projectDir, relativePath);
  try {
    return JSON.parse(await fs.readFile(absolute, 'utf8'));
  } catch (error) {
    failures.push(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function requireFile(relativePath) {
  try {
    await fs.access(path.join(projectDir, relativePath));
  } catch {
    failures.push(`missing required release file: ${relativePath}`);
  }
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

const packageJson = await readJson('package.json');
const versionJson = await readJson('version.json');
const vercelJson = await readJson('vercel.json');

const nodeMajor = Number(process.versions.node.split('.')[0]);
check(nodeMajor >= 22 && nodeMajor < 25, `Node ${process.versions.node} is outside the supported >=22 <25 range`);
check(packageJson?.engines?.node === '>=22 <25', 'package.json must keep the supported Node engine range >=22 <25');
check(packageJson?.license === 'GPL-3.0-or-later', 'package license metadata must remain GPL-3.0-or-later');
check(versionJson?.version === packageJson?.version, 'version.json version must match package.json version');
check(typeof versionJson?.buildHash === 'string' && versionJson.buildHash.length >= 7, 'version.json must contain a generated buildHash');

for (const file of [
  'api/[...all].ts',
  'dist/server/server/server.js',
  'public/html/settings.html',
  'public/json/github-repos.json',
  'public/json/repo-registry.json',
  'public/json/science-tree.json',
  'public/json/commerce-tree.json',
  'public/json/humanities-tree.json',
  'public/js/session-state.js',
  'public/js/shell-nav.js',
  'public/js/settings-nav.js',
  'service-worker.js'
]) await requireFile(file);

const settingsHtml = await fs.readFile(path.join(projectDir, 'public/html/settings.html'), 'utf8');
check(settingsHtml.includes('/public/js/session-state.js'), 'Settings must load session-state.js');
check(settingsHtml.includes('/public/js/shell-nav.js'), 'Settings must load shell-nav.js');
check(settingsHtml.includes('/public/js/settings-nav.js'), 'Settings must load settings-nav.js');
check(!/\/public\/js\/app\.js(?:["'?])/.test(settingsHtml), 'Settings must not load the heavyweight app.js runtime');
check(!settingsHtml.includes('/public/js/stream-runtime.js'), 'Settings must not load stream-runtime.js');
check(!settingsHtml.includes('/public/js/markdown-vendors.js'), 'Settings must not load Markdown vendor clients');
check(settingsHtml.includes('settings-sidebar'), 'Settings must contain the persistent section rail');

const rewrites = Array.isArray(vercelJson?.rewrites) ? vercelJson.rewrites : [];
for (const rewrite of rewrites) {
  if (String(rewrite.destination || '').startsWith('/public/html/')) {
    check(!String(rewrite.destination).endsWith('.html'), `Vercel clean-URL rewrite must use an extensionless destination: ${rewrite.destination}`);
  }
}
check(vercelJson?.cleanUrls === true, 'Vercel cleanUrls must remain enabled');
check(vercelJson?.outputDirectory === '.', 'Vercel outputDirectory must remain the repository root');

const secretPattern = /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|postgres(?:ql)?:\/\/[^\s"']+)/;
for (const relativePath of ['vercel.json', 'package.json', 'public/html/settings.html']) {
  const content = await fs.readFile(path.join(projectDir, relativePath), 'utf8');
  check(!secretPattern.test(content), `credential-like content detected in ${relativePath}`);
}

process.env.NODE_ENV = 'production';
try {
  const serverModule = await import(path.join(projectDir, 'dist/server/server/server.js'));
  const app = typeof serverModule.createApp === 'function'
    ? serverModule.createApp()
    : typeof serverModule.default === 'function'
      ? serverModule.default()
      : null;
  check(typeof app === 'function', 'built serverless entrypoint must expose a callable Express app factory');
  if (typeof app === 'function') {
    const settings = await request(app).get('/settings');
    check(settings.status === 200, `/settings smoke request returned ${settings.status}`);
    check(settings.text.includes('/public/js/session-state.js'), '/settings smoke response is missing session-state.js');
    check(!settings.text.includes('/public/js/app.js'), '/settings smoke response includes app.js');

    const dashboard = await request(app).get('/dashboard');
    check(dashboard.status === 302 && dashboard.headers.location === '/settings#personal-space', '/dashboard must redirect to Settings personal space');

    const session = await request(app).get('/api/session');
    check(session.status === 200, `/api/session smoke request returned ${session.status}`);

    const worker = await request(app).get('/service-worker.js');
    check(worker.status === 200 && worker.text.includes('webman-v41'), 'service worker smoke request is missing the deployed cache version');
  }
} catch (error) {
  failures.push(`built serverless import failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
}

if (failures.length) {
  console.error('[verify-release] FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('[verify-release] PASS');
  console.log(JSON.stringify({ node: process.version, version: packageJson.version, buildHash: versionJson.buildHash, checks: 'release, Vercel route, Settings shell, serverless startup' }, null, 2));
}
