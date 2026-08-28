const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

const baseURL = process.env.BROWSER_BASE_URL || 'http://127.0.0.1:4173';

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    localStorage.setItem('notebooks-theme-family', 'classic');
    localStorage.setItem('notebooks-theme-mode', 'dark');
    localStorage.removeItem('notebooks-theme-global');
  });
  const timings = {};

  async function open(pathname) {
    const started = Date.now();
    await page.goto(`${baseURL}${pathname}${pathname.includes('?') ? '&' : '?'}cb=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    timings[pathname] = Date.now() - started;
    const expectedPath = pathname.split(/[?#]/, 1)[0];
    assert.equal(new URL(page.url()).pathname, expectedPath);
  }

  try {
    await open('/settings#personal-space');
    assert.equal(await page.locator('.global-nav').count(), 1);
    assert.equal(await page.locator('.settings-section-nav').count(), 1);
    assert.equal(await page.locator('.settings-section-nav a').count(), 4);
    assert.equal(await page.locator('a[data-nav="dashboard"]').count(), 0);
    assert.equal(await page.locator('a[data-nav="my-space"]').count(), 0);
    assert.equal(await page.locator('script[src*="/public/js/app.js"]').count(), 0);
    assert.equal(await page.locator('script[src*="stream-runtime.js"]').count(), 0);
    assert.equal(await page.locator('.global-nav-toggle').getAttribute('aria-expanded'), 'false');
    const settingsThemeState = await page.evaluate(() => ({
      mode: document.documentElement.dataset.theme,
      modeMirror: document.documentElement.dataset.themeMode,
      texture: document.documentElement.dataset.themeTexture,
      background: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      foreground: getComputedStyle(document.documentElement).getPropertyValue('--fg').trim()
    }));
    assert.ok(['dark', 'light'].includes(settingsThemeState.mode), `invalid Settings theme mode: ${settingsThemeState.mode}`);
    assert.equal(settingsThemeState.mode, settingsThemeState.modeMirror);
    assert.ok(settingsThemeState.background && settingsThemeState.foreground, 'Settings theme variables are empty');
    assert.equal(settingsThemeState.mode, 'dark');
    assert.equal(settingsThemeState.background, '#1b1f24');
    const settingsSurfaceState = await page.evaluate(() => ({
      surface: getComputedStyle(document.querySelector('.settings-card')).backgroundColor,
      panel: getComputedStyle(document.querySelector('.settings-sidebar')).backgroundColor
    }));
    assert.equal(settingsSurfaceState.surface, 'rgb(38, 43, 50)');
    assert.equal(settingsSurfaceState.panel, 'rgb(38, 43, 50)');
    await page.locator('.global-nav-toggle').click();
    assert.equal(await page.locator('.global-nav-toggle').getAttribute('aria-expanded'), 'true');
    await page.locator('.global-nav-toggle').click();
    assert.equal(await page.locator('.global-nav-toggle').getAttribute('aria-expanded'), 'false');

    const settingsProblems = await page.locator('a, button, input, select').evaluateAll((elements) => elements
      .filter((element) => !element.hasAttribute('hidden') && !element.hasAttribute('disabled'))
      .filter((element) => !(element.getAttribute('aria-label') || element.textContent || element.getAttribute('title') || element.value || '').trim())
      .map((element) => element.outerHTML.slice(0, 160)));
    assert.deepEqual(settingsProblems, [], `unnamed interactive Settings elements: ${settingsProblems.join('\n')}`);

    const settingsScripts = await page.locator('script[src]').evaluateAll((elements) => elements.map((element) => element.src));
    assert.equal(new Set(settingsScripts).size, settingsScripts.length, 'Settings contains duplicate script URLs');

    await page.setViewportSize({ width: 1440, height: 900 });
    await open('/science');
    assert.equal(await page.locator('.global-nav').count(), 1);
    assert.equal(await page.locator('.toolbar > button').count(), 0, 'workspace toolbar still contains action buttons');
    const workspaceLayout = await page.evaluate(() => ({
      treeArea: getComputedStyle(document.querySelector('.tree-rail')).gridArea,
      workspaceArea: getComputedStyle(document.querySelector('.workspace-window')).gridArea,
      treeLeft: document.querySelector('.tree-rail')?.getBoundingClientRect().left || 0,
      workspaceLeft: document.querySelector('.workspace-window')?.getBoundingClientRect().left || 0,
      markerInsideHeader: Boolean(document.querySelector('#treeCurrentLocation')?.closest('.tree-rail-header')),
      treeWidth: document.querySelector('.tree-rail')?.getBoundingClientRect().width || 0
    }));
    assert.equal(workspaceLayout.treeArea, 'tree');
    assert.equal(workspaceLayout.workspaceArea, 'workspace');
    assert.ok(workspaceLayout.treeLeft < workspaceLayout.workspaceLeft, 'tree rail is not the left workspace pane');
    assert.equal(workspaceLayout.markerInsideHeader, true);
    assert.ok(workspaceLayout.treeWidth >= 320, `tree rail is too narrow: ${workspaceLayout.treeWidth}`);
    assert.equal(await page.locator('.sidebar-tree-root > .sidebar-tree-item.folder > .sidebar-tree-row').first().getAttribute('aria-expanded'), 'true', 'repository root is collapsed on first load');
    assert.ok(await page.locator('.sidebar-tree-root > .sidebar-tree-item.folder .sidebar-tree-row').count() > 1, 'expanded repository root does not show child rows');
    const markerStyle = await page.locator('#treeCurrentLocation').evaluate((element) => {
      const style = getComputedStyle(element);
      return { fontSize: style.fontSize, fontWeight: style.fontWeight, borderWidth: style.borderTopWidth, background: style.backgroundColor, color: style.color };
    });
    assert.ok(Number.parseFloat(markerStyle.fontSize) >= 12, `current marker is too small: ${markerStyle.fontSize}`);
    assert.ok(Number.parseInt(markerStyle.fontWeight, 10) >= 700, `current marker is not prominent: ${markerStyle.fontWeight}`);
    assert.ok(Number.parseFloat(markerStyle.borderWidth) >= 2, `current marker border is too subtle: ${markerStyle.borderWidth}`);
    const fileResponse = await page.request.get(`${baseURL}/files/README.md?browser-check=1`);
    assert.equal(fileResponse.status(), 200);
    assert.match(fileResponse.headers()['content-type'] || '', /text\/(markdown|plain)/);
    assert.ok(!(await fileResponse.text()).includes('<!DOCTYPE html>'), 'direct README route returned an HTML shell');
    assert.equal(await page.locator('script[src*="/public/js/app.js"]').count(), 1);
    assert.equal(await page.locator('script[src*="stream-runtime.js"]').count(), 1);
    const streamScripts = await page.locator('script[src]').evaluateAll((elements) => elements.map((element) => element.src));
    assert.equal(new Set(streamScripts).size, streamScripts.length, 'Science contains duplicate script URLs');
    const scienceThemeState = await page.evaluate(() => ({
      nav: getComputedStyle(document.querySelector('.global-nav')).backgroundColor,
      shell: getComputedStyle(document.querySelector('.stream-shell-page')).backgroundImage,
      background: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    }));
    assert.equal(scienceThemeState.background, '#1b1f24');
    assert.equal(scienceThemeState.shell, 'none');
    assert.notEqual(scienceThemeState.nav, 'rgba(2, 5, 4, 0.88)');

    await page.goBack({ waitUntil: 'domcontentloaded' });
    assert.equal(new URL(page.url()).pathname, '/settings');
    await open('/');
    assert.equal(new URL(page.url()).pathname, '/');
    assert.equal(await page.locator('.global-nav').count(), 1);
    assert.equal(await page.locator('a[data-nav="dashboard"]').count(), 0);
    const homeThemeState = await page.evaluate(() => ({
      mode: document.documentElement.dataset.theme,
      texture: document.documentElement.dataset.themeTexture,
      background: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      foreground: getComputedStyle(document.documentElement).getPropertyValue('--fg').trim()
    }));
    assert.ok(['dark', 'light'].includes(homeThemeState.mode), `invalid Home theme mode: ${homeThemeState.mode}`);
    assert.ok(homeThemeState.background && homeThemeState.foreground, 'Home theme variables are empty');
    assert.equal(homeThemeState.mode, 'dark');
    assert.equal(homeThemeState.background, '#1b1f24');

    await open('/about');
    assert.equal(await page.locator('.about-page').count(), 1);
    assert.equal(await page.locator('.about-section').count(), 3);
    assert.equal(await page.locator('#about-idea-title').count(), 1);
    assert.equal(await page.locator('#about-inspirations-title').count(), 1);
    assert.equal(await page.locator('#about-contributors-title').count(), 1);
    assert.equal(await page.locator('.portal-feed').count(), 0);
    assert.equal(await page.locator('.feed-switcher').count(), 0);
    const aboutHero = await page.locator('.about-hero h1').boundingBox();
    assert.ok(aboutHero && aboutHero.width >= 500, `About hero is too small: ${aboutHero?.width || 0}px`);

    const navProblems = await page.locator('.global-nav a').evaluateAll((elements) => elements
      .filter((element) => !(element.textContent || element.getAttribute('aria-label') || '').trim())
      .map((element) => element.outerHTML));
    assert.deepEqual(navProblems, [], `unnamed global navigation links: ${navProblems.join('\n')}`);

    console.log(JSON.stringify({ ok: true, timings }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
