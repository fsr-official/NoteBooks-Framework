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

    await open('/science');
    assert.equal(await page.locator('.global-nav').count(), 1);
    assert.equal(await page.locator('script[src*="/public/js/app.js"]').count(), 1);
    assert.equal(await page.locator('script[src*="stream-runtime.js"]').count(), 1);
    const streamScripts = await page.locator('script[src]').evaluateAll((elements) => elements.map((element) => element.src));
    assert.equal(new Set(streamScripts).size, streamScripts.length, 'Science contains duplicate script URLs');

    await page.goBack({ waitUntil: 'domcontentloaded' });
    assert.equal(new URL(page.url()).pathname, '/settings');
    await open('/');
    assert.equal(new URL(page.url()).pathname, '/');
    assert.equal(await page.locator('.global-nav').count(), 1);
    assert.equal(await page.locator('a[data-nav="dashboard"]').count(), 0);

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
