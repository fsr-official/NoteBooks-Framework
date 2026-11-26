import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const owner = "notebooks-c2-fixture";
const repository = "read-c2-fixture";
const sourcePath = "test/fixtures/read-c2/source.mdx";
const sourceUrl = `/read?owner=${owner}&repo=${repository}&path=${encodeURIComponent(sourcePath)}&branch=main`;
const fixtureMarker = "C2_RUNTIME_HYDRATION_MARKER";

type DiagramWindow = Window & {
  obsidianAttachDiagramControls?: (root?: Element) => void;
  obsidianInitTikz?: (root?: Element) => void;
};

async function installLocalFixtureRoutes(page: Page): Promise<string[]> {
  const contents = await readFile(join(process.cwd(), "test/fixtures/read-c2/source.mdx"));
  const unexpectedRequests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (["http:", "https:", "ws:", "wss:"].includes(url.protocol)
      && !["127.0.0.1", "localhost"].includes(url.hostname)) {
      unexpectedRequests.push(url.href);
    }
  });

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["http:", "https:", "ws:", "wss:"].includes(url.protocol)
      && !["127.0.0.1", "localhost"].includes(url.hostname)) {
      unexpectedRequests.push(url.href);
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/raw") {
      await route.fulfill({ status: 200, contentType: "text/markdown; charset=utf-8", body: contents });
      return;
    }
    if (url.pathname === "/api/telemetry/page-view") {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.abort();
  });

  return unexpectedRequests;
}

async function openLocalReader(page: Page): Promise<string[]> {
  const unexpectedRequests = await installLocalFixtureRoutes(page);
  const response = await page.goto(sourceUrl);
  expect(response?.status()).toBe(200);
  await expect(page.locator("article.next-reader-content")).toBeVisible();
  await expect(page.locator("article.next-reader-content").getByText(fixtureMarker, { exact: true })).toBeVisible();
  return unexpectedRequests;
}

test("keeps the local note readable when IndexedDB is unavailable and contains narrow content at 320/390/768px", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
  });
  const unexpectedRequests = await openLocalReader(page);

  await page.locator("article.next-reader-content .markdown-content").evaluate((article) => {
    const tableViewport = document.createElement("div");
    tableViewport.className = "markdown-table-scroll";
    const table = document.createElement("table");
    table.style.width = "1200px";
    table.innerHTML = "<tbody><tr><td>local wide-table fixture</td></tr></tbody>";
    tableViewport.append(table);
    article.append(tableViewport);

    const diagram = document.createElement("figure");
    diagram.className = "obsidian-mermaid reader-static-diagram";
    diagram.dataset.diagramDeferred = "true";
    diagram.innerHTML = '<svg width="1200" height="180" viewBox="0 0 1200 180" role="img" aria-label="Local diagram fixture"><path d="M0 0 L1200 180"></path></svg>';
    article.append(diagram);
  });

  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const dimensions = await page.evaluate(() => {
      const tableViewport = document.querySelector<HTMLElement>(".markdown-table-scroll");
      const diagram = document.querySelector<HTMLElement>(".obsidian-mermaid");
      const toolbar = document.querySelector<HTMLElement>(".next-reader-toolbar");
      const progress = document.querySelector<HTMLElement>(".next-reader-progress-track");
      const card = document.querySelector<HTMLElement>(".reader-document-card");
      const layout = document.querySelector<HTMLElement>(".next-reader-layout");
      return {
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        tableClientWidth: tableViewport?.clientWidth ?? 0,
        tableScrollWidth: tableViewport?.scrollWidth ?? 0,
        diagramRight: diagram?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
        toolbarRight: toolbar?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
        toolbarBottom: toolbar?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
        progressTop: progress?.getBoundingClientRect().top ?? Number.NEGATIVE_INFINITY,
        progressRight: progress?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
        cardLeft: card?.getBoundingClientRect().left ?? Number.POSITIVE_INFINITY,
        cardRight: card?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
        layoutWidth: layout?.getBoundingClientRect().width ?? 0,
        hasZoomDialog: Boolean(diagram?.querySelector("dialog")),
      };
    });
    expect(dimensions.document, `document horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.tableScrollWidth).toBeGreaterThan(dimensions.tableClientWidth);
    expect(dimensions.diagramRight).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.toolbarRight).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.progressRight).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.progressTop).toBeGreaterThanOrEqual(dimensions.toolbarBottom - 1);
    expect(dimensions.cardLeft).toBeGreaterThanOrEqual(-1);
    expect(dimensions.cardRight).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.layoutWidth).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.hasZoomDialog).toBe(false);
  }
  expect(unexpectedRequests).toEqual([]);
});

test("TikZ static and zoomed SVG stays full-width and centered", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLocalReader(page);
  await page.waitForTimeout(300);
  await page.locator("article.next-reader-content .markdown-content").evaluate((article) => {
    const figure = document.createElement("figure");
    figure.className = "tikz-wrapper";
    figure.dataset.diagramKind = "tikz";
    figure.innerHTML = '<svg width="600" height="328" viewBox="0 0 600 328" role="img" aria-label="Local TikZ width fixture"><rect x="0" y="0" width="600" height="328" fill="none" stroke="currentColor"/></svg>';
    article.append(figure);
  });
  await page.addScriptTag({ url: "/js/obsidian-markdown-it.js" });
  await page.evaluate(() => {
    const article = document.querySelector("article.next-reader-content");
    (window as DiagramWindow).obsidianInitTikz?.(article ?? undefined);
    (window as DiagramWindow).obsidianAttachDiagramControls?.(article ?? undefined);
  });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate(() => {
      const wrapper = document.querySelector<HTMLElement>(".tikz-wrapper");
      const svg = wrapper?.querySelector<SVGElement>("svg");
      if (!wrapper || !svg) throw new Error("TikZ fixture is missing");
      const w = wrapper.getBoundingClientRect();
      const s = svg.getBoundingClientRect();
      return {
        viewport: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        wrapperLeft: w.left,
        wrapperRight: w.right,
        wrapperWidth: w.width,
        svgLeft: s.left,
        svgRight: s.right,
        svgWidth: s.width,
        svgHeight: s.height,
      };
    });
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.wrapperRight).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.svgWidth).toBeGreaterThan(200);
    expect(geometry.svgHeight).toBeGreaterThan(100);
    expect(Math.abs((geometry.svgLeft + geometry.svgRight) / 2 - (geometry.wrapperLeft + geometry.wrapperRight) / 2)).toBeLessThanOrEqual(2);
    expect(geometry.svgWidth / geometry.svgHeight).toBeGreaterThan(1.7);
    expect(geometry.svgWidth / geometry.svgHeight).toBeLessThan(1.9);
  }
  const trigger = page.getByRole("button", { name: /Open zoomable.*TikZ.*diagram|Open zoomable.*tikz/i });
  await trigger.click();
  const dialog = page.locator("dialog.reader-diagram-zoom-dialog");
  await expect(dialog).toBeVisible();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(50);
    const modalGeometry = await dialog.evaluate((element) => {
      const viewport = element.querySelector<HTMLElement>(".reader-diagram-zoom-viewport");
      const canvas = element.querySelector<HTMLElement>(".reader-diagram-zoom-canvas");
      const svg = canvas?.querySelector<SVGElement>("svg");
      const v = viewport?.getBoundingClientRect();
      const c = canvas?.getBoundingClientRect();
      const s = svg?.getBoundingClientRect();
      return {
        viewportWidth: v?.width ?? 0,
        viewportLeft: v?.left ?? 0,
        viewportRight: v?.right ?? 0,
        canvasWidth: c?.width ?? 0,
        svgWidth: s?.width ?? 0,
        svgHeight: s?.height ?? 0,
        svgLeft: s?.left ?? 0,
        svgRight: s?.right ?? 0,
        documentWidth: document.documentElement.scrollWidth,
        viewportDocumentWidth: document.documentElement.clientWidth,
      };
    });
    expect(modalGeometry.documentWidth).toBeLessThanOrEqual(modalGeometry.viewportDocumentWidth);
    expect(modalGeometry.canvasWidth).toBeGreaterThanOrEqual(modalGeometry.svgWidth);
    expect(modalGeometry.svgWidth).toBeGreaterThan(200);
    expect(modalGeometry.svgHeight).toBeGreaterThan(100);
    expect(modalGeometry.svgWidth).toBeLessThanOrEqual(modalGeometry.viewportWidth);
    expect(modalGeometry.svgWidth / modalGeometry.svgHeight).toBeGreaterThan(1.7);
    expect(modalGeometry.svgWidth / modalGeometry.svgHeight).toBeLessThan(1.9);
    expect(Math.abs((modalGeometry.svgLeft + modalGeometry.svgRight) / 2 - (modalGeometry.viewportLeft + modalGeometry.viewportRight) / 2)).toBeLessThanOrEqual(2);
  }
  await dialog.getByRole("button", { name: "Close diagram" }).click();
});

test("uses explicit accessible diagram zoom/pan controls and preserves reader outline/progress behavior", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const unexpectedRequests = await openLocalReader(page);

  const backLink = page.getByRole("link", { name: "Home" });
  await expect(backLink.locator("svg")).toHaveAttribute("aria-hidden", "true");
  await expect(backLink).not.toContainText(/[←↗]/);
  const progress = page.getByRole("progressbar", { name: "Reading progress" });
  await expect(progress).toHaveAttribute("aria-valuenow", "0");

  const outlineToggle = page.locator("header.next-reader-toolbar").getByRole("button", { name: "Outline" });
  const initialExpanded = await outlineToggle.getAttribute("aria-expanded");
  expect(initialExpanded).toMatch(/^(true|false)$/);
  await outlineToggle.click();
  const nextExpanded = initialExpanded === "true" ? "false" : "true";
  await expect(outlineToggle).toHaveAttribute("aria-expanded", nextExpanded);
  const outline = page.getByRole("complementary", { name: "Search and outline" });
  if (nextExpanded === "true") await expect(outline).toBeVisible();
  else await expect(outline).not.toBeVisible();

  await page.locator("article.next-reader-content").evaluate((article) => {
    const spacer = document.createElement("div");
    spacer.dataset.testScrollFixture = "";
    spacer.style.height = "2400px";
    article.append(spacer);
  });
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await expect(progress).toHaveAttribute("aria-valuenow", "100");
  await expect.poll(() => page.evaluate(() => localStorage.getItem(
    "notebooks:reader-progress:notebooks-c2-fixture/read-c2-fixture/test/fixtures/read-c2/source.mdx",
  ))).toBe("1");

  await page.addScriptTag({ url: "/js/obsidian-markdown-it.js" });
  await page.evaluate(() => {
    const article = document.querySelector("article.next-reader-content");
    if (!article) throw new Error("Reader fixture was not mounted");
    const mermaid = document.createElement("figure");
    mermaid.className = "obsidian-mermaid";
    mermaid.dataset.diagramType = "flowchart";
    mermaid.innerHTML = '<svg width="300" height="120" viewBox="0 0 300 120" role="img" aria-label="Local Mermaid fixture"><path d="M0 0 L300 120"></path></svg>';
    const tikz = document.createElement("figure");
    tikz.className = "tikz-wrapper";
    tikz.innerHTML = '<svg width="300" height="120" viewBox="0 0 300 120" role="img" aria-label="Local TikZ fixture"><path d="M0 0 L300 120"></path></svg>';
    article.append(mermaid, tikz);
    (window as DiagramWindow).obsidianAttachDiagramControls?.(article);
  });

  await expect(page.getByRole("button", { name: "Open zoomable diagram" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open zoomable TikZ diagram" })).toBeVisible();
  await expect(page.locator("dialog.reader-diagram-zoom-dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Open zoomable diagram" }).click();
  const dialog = page.getByRole("dialog", { name: "diagram" });
  await expect(dialog).toBeVisible();
  const canvas = dialog.locator(".reader-diagram-zoom-canvas");
  await dialog.getByRole("button", { name: "Zoom in" }).click();
  await expect(canvas).toHaveCSS("transform", /matrix\(1\.25, 0, 0, 1\.25/);
  const viewport = dialog.locator(".reader-diagram-zoom-viewport");
  const viewportBox = await viewport.boundingBox();
  if (!viewportBox) throw new Error("Diagram zoom viewport is not laid out");
  await page.mouse.move(viewportBox.x + 100, viewportBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(viewportBox.x + 140, viewportBox.y + 130);
  await page.mouse.up();
  await expect(canvas).toHaveCSS("transform", /matrix\(1\.25, 0, 0, 1\.25, 40, 30\)/);
  await dialog.getByRole("button", { name: "Reset view" }).click();
  await expect(canvas).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await dialog.getByRole("button", { name: "Close diagram" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open zoomable diagram" })).toBeFocused();
  expect(unexpectedRequests).toEqual([]);
});
