import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const owner = "notebooks-c2-fixture";
const repository = "read-c2-fixture";
const repositoryPath = `${owner}/${repository}`;
const sourcePath = "test/fixtures/read-c2/source.mdx";
const marker = "C2_RUNTIME_HYDRATION_MARKER";
const sourceUrl = `/read?owner=${owner}&repo=${repository}&path=${encodeURIComponent(sourcePath)}&branch=main&returnTo=%2Fscience`;
const supabaseUrl = "http://127.0.0.1:3218";

const fixtureFile = {
  branch: "main",
  fileName: "source.mdx",
  filePath: sourcePath,
  fileSha: "",
  repository: repositoryPath,
  repositoryId: "c2-local-fixture",
  root: "",
};

const fixtureRepository = {
  branch: "main",
  classOrStream: "science",
  commitSha: null,
  id: fixtureFile.repositoryId,
  lfs: false,
  mdxStyledRendering: false,
  name: "C2 Browser Fixture",
  owner,
  pages: false,
  priority: 1,
  repoName: repository,
  root: "",
};

interface BrowserEvidence {
  outsideLoopback: string[];
  supabaseRequests: string[];
  unexpectedApiRequests: string[];
  indexRequests: string[];
  rawRequests: string[];
  telemetryRequests: string[];
}

async function installLocalFixtures(page: Page): Promise<BrowserEvidence> {
  const contents = await readFile(join(process.cwd(), "test/fixtures/read-c2/source.mdx"));
  const fileSha = createHash("sha1")
    .update(Buffer.from(`blob ${contents.byteLength}\0`, "utf8"))
    .update(contents)
    .digest("hex");
  fixtureFile.fileSha = fileSha;

  const evidence: BrowserEvidence = {
    outsideLoopback: [],
    supabaseRequests: [],
    unexpectedApiRequests: [],
    indexRequests: [],
    rawRequests: [],
    telemetryRequests: [],
  };

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      ["http:", "https:", "ws:", "wss:"].includes(url.protocol)
      && !["127.0.0.1", "localhost"].includes(url.hostname)
    ) {
      evidence.outsideLoopback.push(url.href);
    }
    if (url.origin === supabaseUrl) evidence.supabaseRequests.push(url.href);
  });

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      ["http:", "https:", "ws:", "wss:"].includes(url.protocol)
      && !["127.0.0.1", "localhost"].includes(url.hostname)
    ) {
      evidence.outsideLoopback.push(url.href);
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.route("**/api/**", async (route) => {
    evidence.unexpectedApiRequests.push(route.request().url());
    await route.abort();
  });
  await page.route(`${supabaseUrl}/**`, async (route) => {
    evidence.supabaseRequests.push(route.request().url());
    await route.abort();
  });
  await page.route("**/api/public/json/science-tree.json", async (route) => {
    evidence.indexRequests.push("science-tree.json");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        entries: {
          [`${repositoryPath}/${sourcePath}`]: fixtureFile,
        },
      }),
    });
  });
  await page.route("**/api/public/json/github_repositories.json", async (route) => {
    evidence.indexRequests.push("github_repositories.json");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        entries: {
          [repositoryPath]: fixtureRepository,
        },
      }),
    });
  });
  await page.route("**/api/telemetry/page-view", async (route) => {
    evidence.telemetryRequests.push(route.request().url());
    await route.fulfill({ status: 204 });
  });
  await page.route("**/api/raw**", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.searchParams.get("owner") !== owner
      || url.searchParams.get("repo") !== repository
      || url.searchParams.get("path") !== sourcePath
    ) {
      evidence.unexpectedApiRequests.push(url.href);
      await route.abort();
      return;
    }
    evidence.rawRequests.push(url.href);
    await route.fulfill({
      status: 200,
      contentType: "text/markdown; charset=utf-8",
      body: contents,
    });
  });

  return evidence;
}

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || /hydration|did not match/i.test(message.text())) {
      errors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

function expectSafeBrowserEvidence(evidence: BrowserEvidence): void {
  expect(evidence.outsideLoopback).toEqual([]);
  expect(evidence.supabaseRequests).toEqual([]);
  expect(evidence.unexpectedApiRequests).toEqual([]);
}

test("hard-loads the C2 fixture through the real MDX reader without hydration errors", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  const evidence = await installLocalFixtures(page);

  const response = await page.goto(sourceUrl);

  expect(response?.status()).toBe(200);
  const reader = page.locator("article.next-reader-content");
  await expect(reader).toBeVisible();
  await expect(reader.getByText(marker, { exact: true })).toBeVisible();
  await expect(page.locator("main.next-reader-error")).toHaveCount(0);
  expect(errors).toEqual([]);
  expectSafeBrowserEvidence(evidence);
  expect(evidence.rawRequests).toEqual([]);
});

test("soft-navigates from the science stream to the same C2 MDX fixture", async ({ page }) => {
  const errors = collectBrowserErrors(page);
  const evidence = await installLocalFixtures(page);

  await page.goto("/science");
  await expect(page.getByRole("button", { name: /C2 Browser Fixture/ })).toBeVisible();
  expect([...new Set(evidence.indexRequests)].sort()).toEqual([
    "github_repositories.json",
    "science-tree.json",
  ]);

  await page.getByRole("button", { name: /C2 Browser Fixture/ }).click();
  await page.getByRole("button", { name: /^test.*1 file/ }).click();
  await page.getByRole("button", { name: /^fixtures.*1 file/ }).click();
  await page.getByRole("button", { name: /^read-c2.*1 file/ }).click();
  await page.getByRole("button", { name: /source\.mdx/ }).click();
  await expect(page.getByRole("button", { name: /Open file/ })).toBeVisible();
  await page.getByRole("button", { name: /Open file/ }).click();

  await expect(page).toHaveURL(/\/read\?/);
  const reader = page.locator("article.next-reader-content");
  await expect(reader).toBeVisible();
  await expect(reader.getByText(marker, { exact: true })).toBeVisible();
  await expect(page.locator("main.next-reader-error")).toHaveCount(0);
  expect(errors).toEqual([]);
  expectSafeBrowserEvidence(evidence);
  expect(evidence.telemetryRequests.length).toBeGreaterThan(0);
  expect(evidence.rawRequests).toHaveLength(1);
});
