import { expect, test } from "@playwright/test";

const publicTreePaths = [
  "/api/public/json/lowersecondary-tree.json",
  "/api/public/json/science-tree.json",
  "/api/public/json/commerce-tree.json",
  "/api/public/json/humanities-tree.json",
  "/api/public/json/developer-tree.json",
];

async function installLocalFixtures(page: import("@playwright/test").Page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["http:", "https:", "ws:", "wss:"].includes(url.protocol)
      && !["127.0.0.1", "localhost"].includes(url.hostname)) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.startsWith("/api/public/json/") && pathname.endsWith(".json")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ schemaVersion: 1, entries: {} }),
      });
      return;
    }
    if (pathname === "/api/telemetry/page-view") {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.abort();
  });
}

test("landing nav keeps shared destinations, active state, collections, and keyboard-accessible theme controls", async ({ page }) => {
  await installLocalFixtures(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(navigation.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  await expect(navigation.getByRole("link", { name: "Collections", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "A shared shelf for curious minds." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore Science" })).toHaveAttribute("href", "/science");

  for (const [label, href] of [
    ["Lower Secondary", "/lowersecondary"],
    ["Science", "/science"],
    ["Commerce", "/commerce"],
    ["Humanities", "/humanities"],
    ["Developers", "/developers"],
    ["Account", "/account"],
    ["Join", "/register"],
  ]) {
    await expect(navigation.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
  }

  const themeButton = navigation.getByRole("button", { name: "Appearance settings" });
  await themeButton.focus();
  await page.keyboard.press("Enter");
  await expect(navigation.getByLabel("Color palette")).toBeVisible();
  await navigation.getByLabel("Color palette").selectOption("ocean");
  await expect(page.locator("html")).toHaveAttribute("data-theme-preset", "ocean");

  await page.keyboard.press("Escape");
  await page.goto("/science");
  await expect(page).toHaveURL(/\/science$/);
  const streamNavigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(streamNavigation.getByRole("link", { name: "Science", exact: true }))
    .toHaveAttribute("aria-current", "page");
  await expect(streamNavigation.getByRole("link", { name: "Collections", exact: true })).toHaveCount(0);
});

test("mobile landing keeps its folio scene responsive and attempts scene startup", async ({ page }) => {
  await installLocalFixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const artwork = page.locator("figure[aria-labelledby='folio-caption']");
  await expect(artwork).toHaveAttribute("data-scene", /ready|unavailable/);
  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    artwork: document.querySelector("figure[aria-labelledby='folio-caption']")?.getBoundingClientRect().width ?? 0,
  }));
  expect(layout.document).toBeLessThanOrEqual(layout.viewport);
  expect(layout.artwork).toBeGreaterThan(0);
  expect(layout.artwork).toBeLessThanOrEqual(layout.viewport);
  await expect(page.getByRole("heading", { name: "Make room for understanding." })).toBeVisible();
});

test("WebGL unavailability shows the semantic static folio rather than a generic scene failure", async ({ page }) => {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext as unknown as (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) => RenderingContext | null;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: function getContext(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
        return originalGetContext.call(this, type, ...args);
      },
    });
  });
  await installLocalFixtures(page);
  await page.goto("/");

  const artwork = page.locator("figure[aria-labelledby='folio-caption']");
  await expect(artwork).toHaveAttribute("data-scene", "unavailable");
  await expect(page.getByRole("status")).toHaveText(
    "WebGL is unavailable; the folio is shown as a static diagram.",
  );
  await expect(artwork.getByText("FIELD NOTES")).toBeVisible();
  await expect(artwork.getByText("IDEAS", { exact: true })).toBeVisible();
  await expect(artwork.getByRole("status")).not.toHaveText(
    "The interactive folio is unavailable; the static diagram remains.",
  );
});

test("public stream JSON prefetch waits for idle work and schedules one public index at a time", async ({ page }) => {
  await page.addInitScript(() => {
    type ControlledWindow = Window & {
      __pendingPrefetchReleases: Array<() => void>;
      __prefetchPaths: string[];
      __prefetchBeforeHeroUsable: boolean;
    };
    const controlledWindow = window as unknown as ControlledWindow;
    const nativeFetch = window.fetch.bind(window);
    controlledWindow.__pendingPrefetchReleases = [];
    controlledWindow.__prefetchPaths = [];
    controlledWindow.__prefetchBeforeHeroUsable = false;
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (requestUrl.pathname.startsWith("/api/public/json/") && requestUrl.pathname.endsWith(".json")) {
        controlledWindow.__prefetchPaths.push(requestUrl.pathname);
        const title = document.querySelector("#landing-title");
        const titleBounds = title?.getBoundingClientRect();
        if (!title || !titleBounds || titleBounds.width === 0 || titleBounds.height === 0) {
          controlledWindow.__prefetchBeforeHeroUsable = true;
        }
        return new Promise<Response>((resolve, reject) => {
          controlledWindow.__pendingPrefetchReleases.push(() => {
            void nativeFetch(input, init).then(resolve, reject);
          });
        });
      }
      return nativeFetch(input, init);
    }) as typeof window.fetch;
  });
  await installLocalFixtures(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Make room for understanding." })).toBeVisible();
  await page.waitForFunction(() => {
    const controlledWindow = window as unknown as Window & { __pendingPrefetchReleases: unknown[] };
    return controlledWindow.__pendingPrefetchReleases.length > 0;
  });
  const beforeRelease = await page.evaluate(() => {
    const controlledWindow = window as unknown as Window & {
      __prefetchPaths: string[];
      __prefetchBeforeHeroUsable: boolean;
    };
    return { paths: controlledWindow.__prefetchPaths, beforeHeroUsable: controlledWindow.__prefetchBeforeHeroUsable };
  });
  expect(beforeRelease.paths).toEqual([publicTreePaths[0]]);
  expect(beforeRelease.beforeHeroUsable).toBe(false);

  for (const [index, path] of publicTreePaths.entries()) {
    if (index > 0) {
      await page.waitForFunction(() => {
        const controlledWindow = window as unknown as Window & { __pendingPrefetchReleases: unknown[] };
        return controlledWindow.__pendingPrefetchReleases.length > 0;
      });
    }
    const startedPaths = await page.evaluate(() => {
      const controlledWindow = window as unknown as Window & { __prefetchPaths: string[] };
      return controlledWindow.__prefetchPaths;
    });
    expect(startedPaths).toEqual(publicTreePaths.slice(0, index + 1));
    const finishedPromise = page.waitForEvent("requestfinished", (request) => new URL(request.url()).pathname === path);
    await page.evaluate(() => {
      const controlledWindow = window as unknown as Window & { __pendingPrefetchReleases: Array<() => void> };
      const release = controlledWindow.__pendingPrefetchReleases.shift();
      if (!release) throw new Error("No public prefetch request is waiting");
      release();
    });
    await finishedPromise;
  }

  const completedPaths = await page.evaluate(() => {
    const controlledWindow = window as unknown as Window & { __prefetchPaths: string[] };
    return controlledWindow.__prefetchPaths;
  });
  expect(completedPaths).toEqual(publicTreePaths);
  await expect(page.getByRole("heading", { name: "Make room for understanding." })).toBeVisible();
});
