import request from 'supertest';
import { describe, it, expect } from 'vitest';
import createApp from '../src/server/server';

describe('frontend stream shell', () => {
  it('serves the canonical stream shell and stream routes', async () => {
    const app = createApp();

    const home = await request(app).get('/');
    expect(home.status).toBe(200);
    expect(home.text).toContain('id="splash"');
    expect(home.text).toContain('<script src="/public/js/markdown-vendors.js"></script>');
    expect(home.text).not.toContain('mathjax@3/es5/tex-svg.js');
    expect(home.text).not.toContain('mermaid@11/dist/mermaid.min.js');

    const shell = await request(app).get('/public/html/streams.html');
    expect(shell.status).toBe(200);
    expect(shell.text).toContain('class="stream-shell-page"');
    expect(shell.text).toContain('/public/js/app.js');
    expect(shell.text).toContain('openNewMarkdownEditor()');
    expect(shell.text).toContain('/public/js/markdown-editor.js');
    expect(shell.text).toContain('id="previewContainer"');
    expect(shell.text).toContain('id="mobilePreview"');
    expect(shell.text).toContain('/public/css/tree.css');
    expect(shell.text).toContain('/public/js/config.js');

    const dashboard = await request(app).get('/dashboard');
    expect(dashboard.status).toBe(302);
    expect(dashboard.headers.location).toBe('/settings#personal-space');

    const settings = await request(app).get('/settings');
    expect(settings.status).toBe(200);
    expect(settings.text).toContain('Your Dashboard');
    expect(settings.text).toContain('id="personal-space"');
    expect(settings.text).toContain('id="themePreset"');
    expect(settings.text).toContain('id="themePersistenceStatus"');
    expect(settings.text).toContain('id="appearance"');
    expect(settings.text).toContain('id="themePresetGallery"');
    expect(settings.text).toContain('id="themeModeToggle"');
    expect(settings.text).toContain('Every theme family includes a coordinated light and dark variant.');
    expect(settings.text).toContain('id="reading-controls"');
    expect(settings.text).toContain('id="readingFontSize"');
    expect(settings.text).toContain('id="readingWidth"');
    expect(settings.text).toContain('id="readingLineHeight"');
    expect(settings.text).toContain('id="readingCodeWrap"');
    expect(settings.text).toContain('id="readingReducedMotion"');
    expect(settings.text).toContain('class="settings-subsection"');
    const themeJs = await request(app).get('/public/js/theme.js');
    expect(themeJs.status).toBe(200);
    expect(themeJs.text).toContain('/api/themes');
    expect(themeJs.text).toContain('/api/session');
    expect(themeJs.text).toContain('persistCustomTheme');
    expect(themeJs.text).toContain('renderThemePresetGallery');
    expect(themeJs.text).toContain('aria-pressed');
    expect(themeJs.text).toContain('toggleThemeMode');
    expect(themeJs.text).toContain('themeMode');
    const session = await request(app).get('/api/session');
    expect(session.status).toBe(200);
    expect(session.headers['set-cookie']?.some((cookie: string) => cookie.startsWith('nb_sid='))).toBe(true);
    const themes = await request(app).get('/api/themes');
    expect(themes.status).toBe(200);
    expect(themes.body.themes.length).toBeGreaterThanOrEqual(5);

    const readingJs = await request(app).get('/public/js/reading-preferences.js');
    expect(readingJs.status).toBe(200);
    expect(readingJs.text).toContain('persistReadingPreferences');
    expect(readingJs.text).toContain('--reader-content-width');
    const appJs = await request(app).get('/public/js/app.js');
    expect(appJs.status).toBe(200);
    expect(appJs.text).toContain('Edit existing Markdown file');
    expect(appJs.text).toContain('isNewFile: false');
    expect(appJs.text).toContain('window.NoteBooksRawDelivery');
    expect(appJs.text).toContain('const delivery = window.NoteBooksRawDelivery;');
    expect(appJs.text).toContain('getVisibleTreeRows');
    expect(appJs.text).toContain('aria-activedescendant');
    expect(appJs.text).toContain("event.key === 'ArrowRight'");
    expect(appJs.text).not.toContain('const sourceCandidates = (p, forEmbed) => {');
    expect(appJs.text).not.toContain("method: 'HEAD'");
    expect(appJs.text).toContain('const rawUrl = await resolveSourceUrl(path);');
    expect(appJs.text).toContain('const targetPath = repo ? (repoPath || path) : path;');
    expect(appJs.text).toContain('const SHARED_SHELL_ROUTES');
    expect(appJs.text).toContain("if (!slug) return '';");
    expect(appJs.text).toContain('let defaultLandingMarkup = null;');
    expect(appJs.text).toContain('landing.innerHTML = defaultLandingMarkup;');
    expect(appJs.text).toContain('landing.hidden = !isPortalRoute;');
    expect(appJs.text).toContain("document.title = 'NoteBooks';");
    expect(appJs.text).toContain('let updatePollingStarted = false;');
    expect(appJs.text).toContain('function hideSplash()');
    expect(appJs.text).toContain('if (isPortalRoute) hideSplash();');
    expect(appJs.text).toContain('const proxied = await resolveSourceUrl(targetPath);');
    expect(appJs.text).not.toContain('resolvePdfPreviewUrl');

    const vendorLoader = await request(app).get('/public/js/markdown-vendors.js');
    expect(vendorLoader.status).toBe(200);
    expect(vendorLoader.text).toContain('NoteBooksMarkdownVendors');
    expect(vendorLoader.text).toContain('Promise.allSettled');

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
    expect(streamsJs.text).toContain('STREAM_SHELL_ARTIFACTS');
    expect(streamsJs.text).not.toContain('const STREAM_ARTIFACTS');
    expect(streamsJs.text).not.toContain('?_=${Date.now()}');

    const serviceWorker = await request(app).get('/service-worker.js');
    expect(serviceWorker.status).toBe(200);
    expect(serviceWorker.text).toContain("const CACHE_VERSION = 'webman-v31'");
    expect(serviceWorker.text).toContain('public/css/tree.css');
    expect(serviceWorker.text).toContain('Admin routes must always follow the server/Vercel route decision.');
    expect(serviceWorker.text).toContain('Do not fan out to all remote stream APIs during installation.');
    for (const asset of ['public/favicon-128.png', 'public/json/github-repos.json', 'public/js/markdown-vendors.js', 'public/js/theme.js', 'public/js/reading-preferences.js', 'public/js/landing-docs.js', 'public/js/stream-runtime.js', 'public/js/raw-delivery.js', 'public/js/portal.js', 'public/js/shell-nav.js', 'public/html/settings.html', 'public/html/portal.html', 'public/json/science-tree.json', 'public/json/commerce-tree.json', 'public/json/humanities-tree.json']) {
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

    const portal = await request(app).get('/community');
    expect(portal.status).toBe(200);
    expect(portal.text).toContain('class="portal-shell-page"');
    expect(portal.text).toContain('/public/js/portal.js');
    expect(portal.text).not.toContain('/public/js/app.js');

    const admin = await request(app).get('/admin-prs');
    expect(admin.status).toBe(200);
    expect(admin.text).toContain('for="assign-role-email"');
    expect(admin.text).toContain('for="assign-role-role"');
    expect(admin.text).toContain('for="totp-verify-token"');

    const issues = await request(app).get('/issues');
    expect(issues.status).toBe(200);
    expect(issues.text).toContain('class="portal-shell-page"');
  });
});
