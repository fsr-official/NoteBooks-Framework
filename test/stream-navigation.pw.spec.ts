import { expect, test } from "@playwright/test";

const repository = "local/stream-navigation-fixture";
const repositoryId = "stream-navigation-fixture";

const filePaths = [
  "biology/chapter-one/NOTES.md",
  "biology/chapter-one/CNOTES.md",
  "biology/chapter-one/GLOSSARY.md",
  "biology/chapter-one/a-supplement.md",
  "biology/chapter-one/readme.txt",
  "biology/chapter-one/reference.pdf",
  "biology/chapter-one/z-supplement.md",
  "biology/chapter-one/nested/extra.md",
];

const scienceEntries = Object.fromEntries(filePaths.map((filePath) => {
  const fileName = filePath.split("/").at(-1) ?? filePath;
  return [`${repository}/${filePath}`, {
    branch: "main",
    fileName,
    filePath,
    fileSha: filePath.replaceAll("/", "-"),
    repository,
    repositoryId,
    root: "",
  }];
}));

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
  await page.route("http://127.0.0.1:3218/**", (route) => route.abort());
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/api/telemetry/page-view", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/public/json/*.json", async (route) => {
    const filename = new URL(route.request().url()).pathname.split("/").at(-1);
    if (filename === "github_repositories.json") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          schemaVersion: 1,
          entries: {
            [repository]: {
              branch: "main",
              classOrStream: "science",
              id: repositoryId,
              lfs: false,
              name: "Stream Navigation Fixture",
              owner: "local",
              pages: false,
              priority: 1,
              repoName: "stream-navigation-fixture",
              root: "",
            },
          },
        }),
      });
      return;
    }
    const entries = filename === "science-tree.json" ? scienceEntries : {};
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ schemaVersion: 1, entries }),
    });
  });
  await page.route("**/api/raw**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("owner") !== "local" || url.searchParams.get("repo") !== "stream-navigation-fixture") {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/markdown; charset=utf-8",
      body: "# Fixture note\n\nLocal preview fixture.",
    });
  });
}

test("landing navigation exposes every shared destination and preserves its landing controls", async ({ page }) => {
  await installLocalFixtures(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const colorWarnings: string[] = [];
  page.on("console", (message) => {
    if (/THREE\.Color: Unknown color/.test(message.text())) colorWarnings.push(message.text());
  });
  await page.goto("/");

  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(navigation.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  await expect(navigation.getByRole("link", { name: "Collections", exact: true })).toHaveCount(0);
  await expect(navigation.getByRole("button", { name: "Appearance settings" })).toBeVisible();
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

  await navigation.getByRole("button", { name: "Appearance settings" }).focus();
  await page.keyboard.press("Enter");
  await navigation.getByLabel("Color palette").selectOption("ocean");
  await navigation.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "light");

  await navigation.getByRole("link", { name: "Science", exact: true }).click();
  await expect(page).toHaveURL(/\/science$/);
  await expect(page.getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Science", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("html")).toHaveAttribute("data-theme-preset", "ocean");
  expect(colorWarnings).toEqual([]);
});

test("all shared navigation destinations remain operable from a stream page", async ({ page }) => {
  await installLocalFixtures(page);
  await page.goto("/science");

  const destinations = [
    ["Home", "/"],
    ["Lower Secondary", "/lowersecondary"],
    ["Commerce", "/commerce"],
    ["Humanities", "/humanities"],
    ["Developers", "/developers"],
    ["Account", "/account"],
    ["Join", "/register"],
  ] as const;

  for (const [label, href] of destinations) {
    const navigation = page.getByRole("navigation", { name: "Main navigation" });
    const link = navigation.getByRole("link", { name: label, exact: true });
    if (label === "Home") {
      await link.focus();
      await page.keyboard.press("Enter");
    } else {
      await link.click();
    }
    await expect(page).toHaveURL(new RegExp(`${href.replace("/", "\\/")}$`));
    if (href !== "/register") {
      await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    }
  }
});

test("theme colors and special note ordering continue through nested folders", async ({ page }) => {
  await installLocalFixtures(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const homeNavigation = page.getByRole("navigation", { name: "Main navigation" });
  await homeNavigation.getByRole("button", { name: "Appearance settings" }).click();
  await homeNavigation.getByLabel("Color palette").selectOption("ocean");
  await homeNavigation.getByRole("link", { name: "Science", exact: true }).click();

  const repositoryRow = page.getByRole("button", { name: /Stream Navigation Fixture/ });
  const repositoryColor = await repositoryRow.evaluate((row) => getComputedStyle(row).getPropertyValue("--repository-color").trim());
  await repositoryRow.click();
  await page.getByRole("button", { name: /biology.*8 files/ }).click();
  await page.getByRole("button", { name: /chapter-one.*8 files/ }).click();

  const nestedFolder = page.getByRole("button", { name: /nested.*1 file/ });
  const entryKinds = await page.locator(".folder-row, .file-row").evaluateAll((rows) =>
    rows.map((row) => row.classList.contains("folder-row") ? "directory" : "file"));
  expect(entryKinds[0]).toBe("directory");
  expect(entryKinds.slice(1).every((kind) => kind === "file")).toBe(true);
  const folderColor = await nestedFolder
    .evaluate((row) => getComputedStyle(row).getPropertyValue("--repository-color").trim());
  expect(folderColor).toBe(repositoryColor);
  await nestedFolder.focus();
  await page.keyboard.press("Enter");
  const nestedFileColor = await page.locator(".file-row")
    .evaluate((row) => getComputedStyle(row).getPropertyValue("--repository-color").trim());
  expect(nestedFileColor).toBe(repositoryColor);
  await page.getByRole("navigation", { name: "Folder path" }).getByRole("button", { name: "chapter-one" }).click();

  const fileRows = page.locator(".file-row");
  await expect(fileRows).toHaveCount(7);
  await expect(fileRows.nth(0)).toContainText("NOTES.md");
  await expect(fileRows.nth(1)).toContainText("CNOTES.md");
  await expect(fileRows.nth(2)).toContainText("GLOSSARY.md");
  const rowColors = await fileRows.evaluateAll((rows) => rows.map((row) => ({
    name: row.querySelector(".file-name")?.textContent,
    color: getComputedStyle(row).borderLeftColor,
    repositoryColor: getComputedStyle(row).getPropertyValue("--repository-color").trim(),
    badgeColor: getComputedStyle(row.querySelector(".file-type") as HTMLElement).backgroundColor,
  })));
  expect(new Set(rowColors.slice(0, 3).map(({ color }) => color)).size).toBe(3);
  expect(new Set(rowColors.slice(0, 3).map(({ badgeColor }) => badgeColor)).size).toBe(3);
  expect(rowColors.find(({ name }) => name === "a-supplement.md")?.repositoryColor).toBe(repositoryColor);

  await page.getByRole("combobox", { name: "Sort files and repositories" }).selectOption("name-desc");
  await expect(fileRows.nth(0)).toContainText("NOTES.md");
  await expect(fileRows.nth(1)).toContainText("CNOTES.md");
  await expect(fileRows.nth(2)).toContainText("GLOSSARY.md");
  await expect(fileRows.nth(3)).toContainText("z-supplement.md");

  await page.getByRole("combobox", { name: "Filter files" }).selectOption("markdown");
  await expect(fileRows).toHaveCount(5);
  await expect(fileRows.nth(3)).toContainText("z-supplement.md");
  await expect(fileRows.nth(4)).toContainText("a-supplement.md");
  await page.getByRole("combobox", { name: "Filter files" }).selectOption("pdf");
  await expect(fileRows).toHaveCount(1);
  await expect(fileRows.first()).toContainText("reference.pdf");
  await page.getByRole("combobox", { name: "Filter files" }).selectOption("all");
  await page.getByLabel("Search files and repositories").fill("CNOTES.md");
  await expect(fileRows).toHaveCount(1);
  await expect(fileRows.first()).toContainText("CNOTES.md");
  await page.getByLabel("Search files and repositories").clear();
  await expect(fileRows).toHaveCount(7);

  await page.getByRole("button", { name: "Switch to light theme" }).click();
  const lightModeColors = await fileRows.evaluateAll((rows) => rows.slice(0, 3).map((row) => ({
    color: getComputedStyle(row).borderLeftColor,
    badgeColor: getComputedStyle(row.querySelector(".file-type") as HTMLElement).backgroundColor,
  })));
  expect(new Set(lightModeColors.map(({ color }) => color)).size).toBe(3);
  expect(new Set(lightModeColors.map(({ badgeColor }) => badgeColor)).size).toBe(3);

  await fileRows.first().focus();
  await page.keyboard.press("Enter");
  const fileDetails = page.getByRole("complementary", { name: "NOTES.md" });
  await expect(fileDetails).toBeVisible();
  await expect(fileDetails.getByText("biology/chapter-one/NOTES.md", { exact: true })).toBeVisible();
  await expect(fileDetails.getByText(repository, { exact: true })).toBeVisible();
  await expect(fileDetails.getByText("main", { exact: true })).toBeVisible();
  await expect(fileDetails.getByText("biology-chapter-one-NOTES.md", { exact: true })).toBeVisible();
  await expect(fileDetails.getByRole("button", { name: "Open file" })).toBeEnabled();
  await expect(fileDetails.getByRole("link", { name: /Open source on GitHub/ })).toHaveAttribute(
    "href",
    "https://github.com/local/stream-navigation-fixture/blob/main/biology/chapter-one/NOTES.md",
  );
  await fileDetails.getByRole("button", { name: "Close file details" }).click();
  await expect(fileDetails).toBeHidden();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL("/");
});

test("mobile double-click opens the file instead of opening the details overlay", async ({ page }) => {
  await installLocalFixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/science");
  await page.getByRole("button", { name: /Stream Navigation Fixture/ }).click();
  await page.getByRole("button", { name: /biology.*8 files/ }).click();
  await page.getByRole("button", { name: /chapter-one.*8 files/ }).click();
  const notes = page.getByRole("button", { name: "NT NOTES.md ›", exact: true });
  await notes.dblclick();
  await expect(page).toHaveURL(/\/read\?/);
});

test("nested folder and file hierarchy uses the repository family and theme colors", async ({ page }) => {
  await installLocalFixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/science");
  await page.getByRole("button", { name: /Stream Navigation Fixture/ }).click();
  await page.getByRole("button", { name: /biology.*8 files/ }).click();
  await page.getByRole("button", { name: /chapter-one.*8 files/ }).click();
  const styles = await page.evaluate(() => {
    const nested = document.querySelector<HTMLElement>(".folder-name");
    const file = document.querySelector<HTMLElement>(".file-name");
    const repository = document.querySelector<HTMLElement>(".repository-heading strong");
    const get = (element: HTMLElement | null) => element ? {
      family: getComputedStyle(element).fontFamily,
      size: getComputedStyle(element).fontSize,
      color: getComputedStyle(element).color,
    } : null;
    return { folder: get(nested), file: get(file), repository: get(repository), body: get(document.body) };
  });
  expect(styles.folder?.family).toBe(styles.file?.family);
  expect(styles.folder?.size).toBe("13px");
  expect(styles.file?.size).toBe("13px");
  expect(styles.folder?.color).not.toBe(styles.body?.color);
});

test("global navigation is usable without horizontal page overflow on narrow screens", async ({ page }) => {
  await installLocalFixtures(page);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const navigation = page.getByRole("navigation", { name: "Main navigation" });
    await navigation.getByRole("link", { name: "Developers", exact: true }).click();
    await expect(page).toHaveURL(/\/developers$/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, `document overflow at ${width}px`).toBe(false);
    const activeLink = page.getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Developers", exact: true });
    await expect(activeLink).toHaveAttribute("aria-current", "page");
  }
});
