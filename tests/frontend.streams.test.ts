import request from 'supertest';
import { describe, it, expect } from 'vitest';
import createApp from '../src/server/server';

describe('frontend stream shell', () => {
  it('serves the canonical stream shell and stream routes', async () => {
    const app = createApp();

    const shell = await request(app).get('/public/html/streams.html');
    expect(shell.status).toBe(200);
    expect(shell.text).toContain('class="stream-shell-page"');
    expect(shell.text).toContain('/public/js/app.js');
    expect(shell.text).toContain('openNewMarkdownEditor()');
    expect(shell.text).toContain('/public/js/markdown-editor.js');
    expect(shell.text).toContain('id="previewContainer"');
    expect(shell.text).toContain('id="mobilePreview"');
    expect(shell.text).toContain('/public/css/tree.css');

    const appJs = await request(app).get('/public/js/app.js');
    expect(appJs.status).toBe(200);
    expect(appJs.text).toContain('Edit existing Markdown file');
    expect(appJs.text).toContain('isNewFile: false');
    expect(appJs.text).toContain('window.NoteBooksRawDelivery');
    expect(appJs.text).toContain('const delivery = window.NoteBooksRawDelivery;');
    expect(appJs.text).not.toContain('const sourceCandidates = (p, forEmbed) => {');
    expect(appJs.text).not.toContain("method: 'HEAD'");
    expect(appJs.text).toContain('const rawUrl = await resolveSourceUrl(path);');
    expect(appJs.text).toContain('const targetPath = repo ? (repoPath || path) : path;');
    expect(appJs.text).toContain('const proxied = await resolveSourceUrl(targetPath);');
    expect(appJs.text).not.toContain('resolvePdfPreviewUrl');

    const rawDelivery = await request(app).get('/public/js/raw-delivery.js');
    expect(rawDelivery.status).toBe(200);
    expect(rawDelivery.text).toContain('window.NoteBooksRawDelivery');

    const mobileJs = await request(app).get('/public/js/mobile.js');
    expect(mobileJs.status).toBe(200);
    expect(mobileJs.text).toContain('Edit existing Markdown file');
    expect(mobileJs.text).toContain("selected.repo || ''");

    const streamsJs = await request(app).get('/public/client/streams.js');
    expect(streamsJs.status).toBe(200);
    expect(streamsJs.text).toContain('initStreamShell');

    const serviceWorker = await request(app).get('/service-worker.js');
    expect(serviceWorker.status).toBe(200);
    expect(serviceWorker.text).toContain("const CACHE_VERSION = 'webman-v12'");
    expect(serviceWorker.text).toContain('public/css/tree.css');
    expect(serviceWorker.text).toContain('Admin routes must always follow the server/Vercel route decision.');
    for (const asset of ['public/js/theme.js', 'public/js/landing-docs.js', 'public/js/stream-runtime.js', 'public/js/raw-delivery.js', 'public/html/settings.html', 'public/json/science-tree.json', 'public/json/commerce-tree.json', 'public/json/humanities-tree.json']) {
      expect(serviceWorker.text).toContain(asset);
    }

    const streamsCss = await request(app).get('/public/css/streams.css');
    expect(streamsCss.status).toBe(200);
    const styleCss = await request(app).get('/public/css/style.css');
    expect(styleCss.status).toBe(200);
    expect(styleCss.text).toContain('.stream-card');

    const page = await request(app).get('/science');
    expect(page.status).toBe(200);
    expect(page.text).toContain('class="stream-shell-page"');
  });
});
