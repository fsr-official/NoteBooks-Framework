const { chromium } = require('playwright-chromium');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto('http://localhost:4000/science', { waitUntil: 'networkidle' });
    // Wait briefly for client script to load and render the tree
    await page.waitForTimeout(1000);
    const shellPresent = !!(await page.$('#subjectLanding'));
    const fragmentPresent = !!(await page.$('#subject-tree'));
    const listPresent = !!(await page.$('#subject-tree .subject-tree-list'));
    const nodesCount = listPresent ? await page.$$eval('#subject-tree .subject-tree-node', els => els.length) : 0;
    console.log(JSON.stringify({ shellPresent, fragmentPresent, listPresent, nodesCount }));
  } catch (err) {
    console.error('ERROR', err && err.message ? err.message : err);
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
})();
