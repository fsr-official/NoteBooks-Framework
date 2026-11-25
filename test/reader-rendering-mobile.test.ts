import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderNote } from "@/lib/markdown/renderer";

const markdownReader = readFileSync(new URL("../src/components/markdown-reader.tsx", import.meta.url), "utf8");
const nextMarkdownReader = readFileSync(new URL("../src/components/next-markdown-reader.tsx", import.meta.url), "utf8");
const precompiledReader = readFileSync(new URL("../src/components/precompiled-html-reader/reader.tsx", import.meta.url), "utf8");
const precompiledRuntime = readFileSync(new URL("../src/components/precompiled-html-reader/runtime/chapter-reader.js", import.meta.url), "utf8");
const chapterReader = readFileSync(new URL("../src/components/chapter-bundle/chapter-reader.tsx", import.meta.url), "utf8");
const diagramRuntime = readFileSync(new URL("../public/js/obsidian-markdown-it.js", import.meta.url), "utf8");

type FakeRecord = { key: string; html: string; size: number; accessedAt: number };
type FakeObjectStore = {
  put(record: FakeRecord): IDBRequest<FakeRecord>;
  get(key: string): IDBRequest<FakeRecord | undefined>;
  getAll(): IDBRequest<FakeRecord[]>;
  delete(key: string): IDBRequest<boolean>;
};
type FakeRequest = {
  result: unknown;
  onsuccess: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onupgradeneeded: ((event: Event) => void) | null;
  onblocked: ((event: Event) => void) | null;
};

class MemoryIndexedDb {
  readonly records = new Map<string, FakeRecord>();
  failOpen = false;
  failTransactions = false;
  private storeCreated = false;

  readonly factory = {
    open: () => {
      const request: FakeRequest = {
        result: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
      };
      setTimeout(() => {
        if (this.failOpen) {
          request.onerror?.({ target: request } as unknown as Event);
          return;
        }
        request.result = this.database;
        request.onupgradeneeded?.({ target: request } as unknown as Event);
        request.onsuccess?.({ target: request } as unknown as Event);
      }, 0);
      return request;
    },
  } as unknown as IDBFactory;

  private readonly store = {
    put: (record: FakeRecord) => this.enqueue(() => {
      this.records.set(record.key, record);
      return record;
    }),
    get: (key: string) => this.enqueue(() => this.records.get(key)),
    getAll: () => this.enqueue(() => Array.from(this.records.values())),
    delete: (key: string) => this.enqueue(() => this.records.delete(key)),
  };

  private readonly database = {
    objectStoreNames: { contains: () => this.storeCreated },
    createObjectStore: () => {
      this.storeCreated = true;
      return this.store;
    },
    transaction: () => {
      if (this.failTransactions) throw new Error("storage unavailable");
      let pending = 0;
      const transaction: {
        oncomplete: ((event: Event) => void) | null;
        onerror: ((event: Event) => void) | null;
        onabort: ((event: Event) => void) | null;
        objectStore: () => FakeObjectStore;
      } = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: () => this.store,
      };
      const enqueue = <T>(operation: () => T): IDBRequest<T> => {
        pending += 1;
        const request: FakeRequest = {
          result: undefined,
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
          onblocked: null,
        };
        setTimeout(() => {
          try {
            request.result = operation();
            request.onsuccess?.({ target: request } as unknown as Event);
          } catch {
            request.onerror?.({ target: request } as unknown as Event);
          } finally {
            pending -= 1;
            if (pending === 0) setTimeout(() => transaction.oncomplete?.({ target: transaction } as unknown as Event), 0);
          }
        }, 0);
        return request as unknown as IDBRequest<T>;
      };
      transaction.objectStore = () => ({
        put: (record: FakeRecord) => enqueue(() => {
          this.records.set(record.key, record);
          return record;
        }),
        get: (key: string) => enqueue(() => this.records.get(key)),
        getAll: () => enqueue(() => Array.from(this.records.values())),
        delete: (key: string) => enqueue(() => this.records.delete(key)),
      });
      return transaction as unknown as IDBTransaction;
    },
  } as unknown as IDBDatabase;

  private enqueue<T>(operation: () => T): IDBRequest<T> {
    const request: FakeRequest = {
      result: undefined,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      onblocked: null,
    };
    setTimeout(() => {
      request.result = operation();
      request.onsuccess?.({ target: request } as unknown as Event);
    }, 0);
    return request as unknown as IDBRequest<T>;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadCache(indexedDb?: IDBFactory) {
  vi.resetModules();
  vi.stubGlobal("crypto", webcrypto as Crypto);
  vi.stubGlobal("indexedDB", indexedDb);
  return import("../src/lib/reader-render-cache");
}

describe("reader rendered-note cache", () => {
  it("keys entries by file identity, renderer, and source revision", async () => {
    const cache = await loadCache();
    const identity = {
      owner: "notebook-owner",
      repository: "study-notes",
      path: "physics/chapter.md",
      revision: "commit-a:source-a",
      renderer: "server-markdown" as const,
    };

    expect(cache.readerRenderCacheKey(identity)).not.toBeNull();
    expect(cache.readerRenderCacheKey(identity)).not.toBe(cache.readerRenderCacheKey({
      ...identity,
      path: "chemistry/chapter.md",
    }));
    expect(cache.readerRenderCacheKey(identity)).not.toBe(cache.readerRenderCacheKey({
      ...identity,
      revision: "commit-a:source-b",
    }));
    expect(cache.readerRenderCacheKey(identity)).not.toBe(cache.readerRenderCacheKey({
      ...identity,
      renderer: "client-markdown",
    }));
    expect(cache.readerRenderCacheKey({ ...identity, owner: "" })).toBeNull();

    const revision = await cache.readerSourceRevision("commit-a", "same markdown");
    expect(revision).toBe(await cache.readerSourceRevision("commit-a", "same markdown"));
    expect(revision).not.toBe(await cache.readerSourceRevision("commit-a", "changed markdown"));
    expect(revision).toMatch(/^commit-a:[a-f0-9]{64}$/);
  });

  it("round-trips rendered HTML through IndexedDB", async () => {
    const indexedDb = new MemoryIndexedDb();
    const cache = await loadCache(indexedDb.factory);

    await cache.writeRenderedNote("reader-entry", "<p>cached note</p>");

    await expect(cache.readRenderedNote("reader-entry")).resolves.toBe("<p>cached note</p>");
  });

  it("bounds entry size, total bytes, and retained entry count", async () => {
    const indexedDb = new MemoryIndexedDb();
    const cache = await loadCache(indexedDb.factory);

    for (let index = 0; index < 13; index += 1) {
      await cache.writeRenderedNote(`small-${index}`, `html-${index}`);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(indexedDb.records.size).toBe(12);
    expect(indexedDb.records.has("small-0")).toBe(false);
    expect(indexedDb.records.has("small-12")).toBe(true);

    const oversizeHtml = "x".repeat(2_621_441);
    await cache.writeRenderedNote("over-entry-limit", oversizeHtml);
    expect(indexedDb.records.has("over-entry-limit")).toBe(false);

    const largeHtml = "y".repeat(2_300_000);
    for (let index = 0; index < 3; index += 1) {
      await cache.writeRenderedNote(`large-${index}`, largeHtml);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const largeKeys = Array.from(indexedDb.records.keys()).filter((key) => key.startsWith("large-"));
    expect(largeKeys).toEqual(["large-1", "large-2"]);
    expect(indexedDb.records.size).toBeLessThanOrEqual(12);
    expect(Array.from(indexedDb.records.values()).reduce((total, record) => total + record.size, 0))
      .toBeLessThanOrEqual(12 * 1024 * 1024);
  });

  it("treats missing or failing IndexedDB as an optional cache, not a read failure", async () => {
    const withoutStorage = await loadCache();
    await expect(withoutStorage.writeRenderedNote("unavailable", "<p>readable</p>")).resolves.toBeUndefined();
    await expect(withoutStorage.readRenderedNote("unavailable")).resolves.toBeNull();

    const openFailure = new MemoryIndexedDb();
    openFailure.failOpen = true;
    const failedOpenCache = await loadCache(openFailure.factory);
    await expect(failedOpenCache.writeRenderedNote("open-fails", "<p>still readable</p>")).resolves.toBeUndefined();
    await expect(failedOpenCache.readRenderedNote("open-fails")).resolves.toBeNull();

    const transactionFailure = new MemoryIndexedDb();
    transactionFailure.failTransactions = true;
    const failedTransactionCache = await loadCache(transactionFailure.factory);
    await expect(failedTransactionCache.writeRenderedNote("transaction-fails", "<p>still readable</p>")).resolves.toBeUndefined();
    await expect(failedTransactionCache.readRenderedNote("transaction-fails")).resolves.toBeNull();
  });
});

describe("static diagrams and responsive reader contracts", () => {
  it("keeps math and Mermaid arrows while replacing decorative reader arrows with an aria-hidden icon", () => {
    const rendered = renderNote([
      "Inline math \\(x \\to y\\).",
      "",
      "```mermaid",
      "flowchart LR",
      "  A --> B",
      "```",
    ].join("\n"));

    expect(rendered.html).toContain("class=\"katex\"");
    expect(rendered.figures[0]?.source).toContain("A --> B");
    expect(nextMarkdownReader).toContain('<svg aria-hidden="true"');
    expect(nextMarkdownReader).not.toContain("← <span>{backLabel}</span>");
    expect(nextMarkdownReader).not.toContain("GitHub ↗");
  });

  it("wires explicit static diagram controls into all four reader surfaces", () => {
    expect(markdownReader).toContain("obsidianAttachDiagramControls?.(container)");
    expect(nextMarkdownReader).toContain("obsidianAttachDiagramControls?.(root)");
    expect(precompiledReader).toContain('import("./runtime/chapter-reader.js")');
    expect(precompiledRuntime).toContain("function attachDiagrams(root, cleanups)");
    expect(precompiledRuntime).toContain("attachFeature(root, () => attachDiagrams(root, cleanups))");
    expect(chapterReader).toContain("installStaticChapterDiagrams(contentElement, bundle.diagrams");
    expect(chapterReader).toContain("runtime.obsidianAttachDiagramControls?.(root)");

    expect(diagramRuntime).toContain("button.addEventListener('click', function ()");
    expect(diagramRuntime).toContain("_openDiagramZoomSurface(button, svg, title)");
    expect(diagramRuntime).toContain("button.setAttribute('aria-label', 'Open zoomable ' + title)");
    expect(diagramRuntime).toContain("button('Zoom in'");
    expect(diagramRuntime).toContain("button('Zoom out'");
    expect(diagramRuntime).toContain("button('Reset view'");
    expect(diagramRuntime).toContain("viewport.addEventListener('pointerdown'");
    expect(diagramRuntime).toContain("dialog.showModal()");
  });

  it("keeps the outline and progress controls accessible and restores saved reading position", () => {
    expect(nextMarkdownReader).toContain('aria-expanded={effectiveOutlineOpen}');
    expect(nextMarkdownReader).toContain('aria-label="Reading progress"');
    expect(nextMarkdownReader).toContain('localStorage.getItem(key)');
    expect(nextMarkdownReader).toContain('localStorage.setItem(key, String(progress))');
    expect(nextMarkdownReader).toContain('window.scrollTo({ top: max * Math.min(saved, 1), behavior: "instant" })');
    expect(nextMarkdownReader).toContain('window.addEventListener("scroll", onScroll, { passive: true })');
  });

  it.each([
    ["src/app/markdown-reader.css", /\.reader-actions\s*\{[\s\S]*?overflow-x:\s*auto/],
    ["src/app/reader-redesign.css", /\.next-reader-layout,\s*\.next-reader-layout\.outline-collapsed\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/],
    ["src/app/precompiled-html-reader.css", /@media\s*\(max-width:\s*640px\)[\s\S]*?\.chapter-reader-columns\s*\{\s*display:\s*flex;\s*flex-direction:\s*column;/],
    ["src/app/chapter-reader.css", /@media\s*\(max-width:\s*720px\)[\s\S]*?\.chapter-reader-grid\s*\{\s*display:\s*block;/],
  ])("has a narrow-screen layout rule in %s", (path, rule) => {
    const stylesheet = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    expect(stylesheet).toMatch(rule);
  });
});
