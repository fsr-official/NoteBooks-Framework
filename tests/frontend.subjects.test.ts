import request from 'supertest';
import { describe, it, expect } from 'vitest';
import createApp from '../src/server/server';

describe('frontend subject shell', () => {
  it('serves the canonical subject shell and subject routes', async () => {
    const app = createApp();

    const shell = await request(app).get('/public/html/subjects.html');
    expect(shell.status).toBe(200);
    expect(shell.text).toContain('class="subject-shell-page"');
    expect(shell.text).toContain('/public/js/app.js');
    expect(shell.text).toContain('openNewMarkdownEditor()');
    expect(shell.text).toContain('/public/js/markdown-editor.js');

    const appJs = await request(app).get('/public/js/app.js');
    expect(appJs.status).toBe(200);
    expect(appJs.text).toContain('Edit existing Markdown file');
    expect(appJs.text).toContain('isNewFile: false');
    expect(appJs.text).toContain('const sourceCandidates = (p, forEmbed) => {');
    expect(appJs.text).toContain('const resolveSourceUrl = (p) => {');
    expect(appJs.text).not.toContain("method: 'HEAD'");
    expect(appJs.text).toContain('const rawUrl = await resolveSourceUrl(path);');
    expect(appJs.text).toContain('const targetPath = repo ? (repoPath || path) : path;');
    expect(appJs.text).toContain('const proxied = await resolveSourceUrl(targetPath);');
    expect(appJs.text).not.toContain('resolvePdfPreviewUrl');

    const mobileJs = await request(app).get('/public/js/mobile.js');
    expect(mobileJs.status).toBe(200);
    expect(mobileJs.text).toContain('Edit existing Markdown file');
    expect(mobileJs.text).toContain("selected.repo || ''");

    const serviceWorker = await request(app).get('/service-worker.js');
    expect(serviceWorker.status).toBe(200);
    expect(serviceWorker.text).toContain("const CACHE_VERSION = 'webman-v10'");
    expect(serviceWorker.text).toContain('Admin routes must always follow the server/Vercel route decision.');

    const page = await request(app).get('/science');
    expect(page.status).toBe(200);
    expect(page.text).toContain('class="subject-shell-page"');
  });
});
