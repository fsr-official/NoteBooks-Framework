import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const owner = "notebooks-c2-fixture";
const repositoryName = "read-c2-fixture";
const repository = `${owner}/${repositoryName}`;
const repositoryId = "c2-local-fixture";
const filePath = "test/fixtures/read-c2/source.mdx";
const fileName = "source.mdx";
const fixtureContents = readFileSync("test/fixtures/read-c2/source.mdx");
const fileSha = createHash("sha1")
  .update(Buffer.from(`blob ${fixtureContents.byteLength}\0`, "utf8"))
  .update(fixtureContents)
  .digest("hex");
const previewBody = "C2_RUNTIME_HYDRATION_MARKER";
const readerBody = previewBody;

const fileEntries = {
  [`${repository}/${filePath}`]: {
    branch: "main",
    fileName,
    filePath,
    fileSha,
    repository,
    repositoryId,
    root: "",
  },
};

async function installLocalFixtures(page: Page): Promise<void> {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      ["http:", "https:", "ws:", "wss:"].includes(url.protocol)
      && !["127.0.0.1", "localhost"].includes(url.hostname)
    ) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/api/telemetry/page-view", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/public/json/*.json", async (route) => {
    const filename = new URL(route.request().url()).pathname.split("/").at(-1);
    const entries = filename === "github_repositories.json"
      ? {
        [repository]: {
          branch: "main",
          classOrStream: "science",
          id: repositoryId,
          lfs: false,
          mdxStyledRendering: false,
          name: "C2 Browser Fixture",
          owner,
          pages: false,
          priority: 1,
          repoName: repositoryName,
          root: "",
        },
      }
      : filename === "science-tree.json" ? fileEntries : {};
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ schemaVersion: 1, entries }),
    });
  });
  await page.route("**/api/raw**", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.searchParams.get("owner") !== owner
      || url.searchParams.get("repo") !== repositoryName
      || url.searchParams.get("path") !== filePath
    ) {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/markdown; charset=utf-8",
      body: fixtureContents.toString("utf8"),
    });
  });
}

async function openFixtureFile(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/science");
  await page.getByRole("button", { name: /C2 Browser Fixture/ }).click();
  await page.getByRole("button", { name: /^test.*1 file/ }).click();
  await page.getByRole("button", { name: /^fixtures.*1 file/ }).click();
  await page.getByRole("button", { name: /^read-c2.*1 file/ }).click();
  const rawResponse = page.waitForResponse((response) => response.url().includes("/api/raw"));
  await page.getByRole("button", { name: /source\.mdx/ }).click();
  await rawResponse;
  await expect(page.getByRole("heading", { name: fileName })).toBeVisible();
}

test.describe("stream file details drawer", () => {
  test("anchors to the right viewport edge with full height, backdrop, metadata, and actions", async ({ page }) => {
    await installLocalFixtures(page);

    for (const width of [320, 390, 768]) {
      await openFixtureFile(page, width);
      const drawer = page.getByRole("dialog", { name: fileName });
      const backdrop = page.getByRole("button", { name: "Dismiss file details" });
      await expect(drawer).toBeVisible();
      await expect(drawer).toHaveAttribute("aria-modal", "true");
      await expect(backdrop).toBeVisible();
      await drawer.evaluate(async (element) => {
        await Promise.all(element.getAnimations().map((animation) => animation.finished));
      });

      const geometry = await page.evaluate(() => {
        const drawerElement = document.querySelector<HTMLElement>(".file-detail");
        const layerElement = document.querySelector<HTMLElement>(".file-detail-layer");
        if (!drawerElement || !layerElement) throw new Error("File details drawer is missing.");
        const drawerRect = drawerElement.getBoundingClientRect();
        const layerRect = layerElement.getBoundingClientRect();
        return {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          drawer: {
            left: drawerRect.left,
            top: drawerRect.top,
            right: drawerRect.right,
            bottom: drawerRect.bottom,
            width: drawerRect.width,
            height: drawerRect.height,
          },
          layer: {
            left: layerRect.left,
            top: layerRect.top,
            right: layerRect.right,
            bottom: layerRect.bottom,
            width: layerRect.width,
            height: layerRect.height,
          },
        };
      });

      expect(geometry.drawer.right).toBeCloseTo(geometry.viewportWidth, 0);
      expect(geometry.drawer.left).toBe(Math.max(0, width - 400));
      expect(geometry.drawer.top).toBeCloseTo(0, 0);
      expect(geometry.drawer.bottom).toBeCloseTo(geometry.viewportHeight, 0);
      expect(geometry.drawer.width).toBe(Math.min(400, width));
      expect(geometry.drawer.height).toBe(844);
      expect(geometry.layer.left).toBeCloseTo(0, 0);
      expect(geometry.layer.top).toBeCloseTo(0, 0);
      expect(geometry.layer.right).toBeCloseTo(geometry.viewportWidth, 0);
      expect(geometry.layer.bottom).toBeCloseTo(geometry.viewportHeight, 0);
      expect(geometry.layer.height).toBe(844);

      await expect(drawer.getByText(repository, { exact: true })).toBeVisible();
      await expect(drawer.getByText("main", { exact: true })).toBeVisible();
      await expect(drawer.getByText(fileSha, { exact: true })).toBeVisible();
      await expect(drawer.getByRole("button", { name: "Open file" })).toBeEnabled();
      await expect(drawer.getByRole("link", { name: /Open source on GitHub/ })).toHaveAttribute(
        "href",
        `https://github.com/${repository}/blob/main/${filePath}`,
      );
      await expect(page.getByText(previewBody, { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

      await page.getByRole("button", { name: "Close file details" }).click();
      await expect(drawer).toBeHidden();
    }
  });

  test("traps focus, locks page scrolling, and restores focus and scrolling on Escape", async ({ page }) => {
    await installLocalFixtures(page);
    await openFixtureFile(page, 390);

    const drawer = page.getByRole("dialog", { name: fileName });
    const closeButton = page.getByRole("button", { name: "Close file details" });
    const openButton = page.getByRole("button", { name: "Open file" });
    const sourceLink = page.getByRole("link", { name: /Open source on GitHub/ });
    const trigger = page.getByRole("button", { name: /source\.mdx/ });

    await expect(closeButton).toBeFocused();
    expect(await page.evaluate(() => ({
      body: document.body.style.overflow,
      document: document.documentElement.style.overflow,
    }))).toEqual({ body: "hidden", document: "hidden" });

    await page.keyboard.press("Tab");
    await expect(openButton).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(sourceLink).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(closeButton).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => ({
      body: document.body.style.overflow,
      document: document.documentElement.style.overflow,
    }))).toEqual({ body: "", document: "" });
  });

  test("dismisses from the backdrop and restores the selected file's focus", async ({ page }) => {
    await installLocalFixtures(page);
    await openFixtureFile(page, 768);

    const drawer = page.getByRole("dialog", { name: fileName });
    const trigger = page.getByRole("button", { name: /source\.mdx/ });
    await expect(page.getByRole("button", { name: "Dismiss file details" })).toBeVisible();
    await page.getByRole("button", { name: "Dismiss file details" }).click({ position: { x: 12, y: 12 } });

    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => ({
      body: document.body.style.overflow,
      document: document.documentElement.style.overflow,
    }))).toEqual({ body: "", document: "" });
  });

  test("opens the selected file in the reader and returns to its stream", async ({ page }) => {
    await installLocalFixtures(page);
    await openFixtureFile(page, 390);

    const drawer = page.getByRole("dialog", { name: fileName });
    await drawer.getByRole("button", { name: "Open file" }).click();
    await expect(page).toHaveURL(/\/read\?/);
    await expect(page).toHaveURL(new RegExp(`owner=${owner}`));
    await expect(page).toHaveURL(new RegExp(`repo=${repositoryName}`));
    await expect(page.locator("article.next-reader-content")).toContainText(readerBody);

    await page.goBack();
    await expect(page).toHaveURL(/\/science$/);
  });

  test("double-clicking a stream file continues to open the reader", async ({ page }) => {
    await installLocalFixtures(page);
    await openFixtureFile(page, 1440);

    await page.getByRole("button", { name: "Close file details" }).click();
    await page.getByRole("button", { name: /source\.mdx/ }).dblclick();

    await expect(page).toHaveURL(/\/read\?/);
    await expect(page.locator("article.next-reader-content")).toContainText(readerBody);
  });
});
