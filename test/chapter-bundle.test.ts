import { describe, expect, it, vi } from "vitest";
import {
  ChapterBundleLoadError,
  ChapterNotAvailableError,
  createChapterBundleLoader,
  type ChapterBundleCache,
} from "../src/lib/chapter-bundle";
import type { ChapterBundle, ChapterManifest } from "../src/lib/chapter-bundle/schema";

const chapterId = "physics06-system-of-particles-and-rotational-motion";
const commitSha = "a".repeat(40);
const previousCommitSha = "b".repeat(40);
const sourceShas = {
  glossary: "1".repeat(64),
  notes: "2".repeat(64),
  cnotes: "3".repeat(64),
};

function bundle(overrides: Partial<ChapterBundle> = {}): ChapterBundle {
  return {
    schemaVersion: 2,
    id: chapterId,
    title: "System of Particles and Rotational Motion",
    rendererVersion: "0.1.2",
    sourceShas,
    outline: [],
    notes: { tree: [] },
    facts: [],
    examples: [],
    glossary: {},
    diagrams: [],
    desmos: [],
    ...overrides,
  };
}

function manifest(chapter: ChapterBundle = bundle()): ChapterManifest {
  return {
    schemaVersion: 2,
    rendererVersion: chapter.rendererVersion,
    chapters: [{
      id: chapter.id,
      title: chapter.title,
      bundle: `${chapter.id}.json`,
      sourceShas: chapter.sourceShas,
    }],
  };
}

class MemoryCache implements ChapterBundleCache {
  readonly values = new Map<string, string>();
  readonly writes: Array<{ key: string; ttlSeconds?: number }> = [];

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.values.set(key, value);
    this.writes.push({ key, ttlSeconds });
  }
}

function loaderFor(
  cache: MemoryCache,
  remoteBundle: unknown = bundle(),
  remoteManifest: unknown = manifest(),
) {
  const fetcher = vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith("/build/manifest.json")) {
      return Response.json(remoteManifest);
    }
    return Response.json(remoteBundle);
  });
  const log = vi.fn();
  return {
    fetcher,
    log,
    loader: createChapterBundleLoader({ cache, fetch: fetcher, log }),
  };
}

describe("chapter bundle loader", () => {
  it("fetches at a pinned SHA, validates metadata, and caches by SHA and renderer version", async () => {
    const cache = new MemoryCache();
    const { fetcher, loader } = loaderFor(cache);

    const result = await loader.getChapterBundle(chapterId, commitSha.toUpperCase());

    expect(result).toEqual({ bundle: bundle(), sourceCommitSha: commitSha, stale: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0][0])).toContain(`/${commitSha}/build/manifest.json`);
    expect(String(fetcher.mock.calls[1][0])).toContain(`/${commitSha}/build/${chapterId}.json`);
    expect(cache.writes).toContainEqual({
      key: `notebooks:chapter-bundle:v2:bundle:${commitSha}:0.1.2:${chapterId}`,
      ttlSeconds: 86_400,
    });
    expect(cache.values.has(`notebooks:chapter-bundle:v2:last-good:${chapterId}`)).toBe(true);
  });

  it("serves a cached bundle for the same commit without fetching it again", async () => {
    const cache = new MemoryCache();
    const first = loaderFor(cache);
    await first.loader.getChapterBundle(chapterId, commitSha);

    const second = loaderFor(cache);
    const result = await second.loader.getChapterBundle(chapterId, commitSha);

    expect(result.stale).toBe(false);
    expect(second.fetcher).not.toHaveBeenCalled();
  });

  it("serves the last known-good bundle when upstream metadata is inconsistent", async () => {
    const cache = new MemoryCache();
    const previousBundle = bundle({ title: "Previously verified chapter" });
    cache.values.set(
      `notebooks:chapter-bundle:v2:last-good:${chapterId}`,
      JSON.stringify({ commitSha: previousCommitSha, bundle: previousBundle }),
    );
    const invalidBundle = bundle({
      sourceShas: { ...sourceShas, notes: "4".repeat(64) },
    });
    const { loader, log } = loaderFor(cache, invalidBundle);

    const result = await loader.getChapterBundle(chapterId, commitSha);

    expect(result).toEqual({
      bundle: previousBundle,
      sourceCommitSha: previousCommitSha,
      stale: true,
    });
    expect(log).toHaveBeenCalledWith(
      "Chapter bundle load failed; serving the last known-good bundle",
      expect.objectContaining({ chapterId, commitSha, sourceCommitSha: previousCommitSha }),
    );
  });

  it("rejects a chapter absent from the pinned manifest instead of using stale membership", async () => {
    const cache = new MemoryCache();
    cache.values.set(
      `notebooks:chapter-bundle:v2:last-good:${chapterId}`,
      JSON.stringify({ commitSha: previousCommitSha, bundle: bundle() }),
    );
    const { loader } = loaderFor(cache, bundle(), {
      schemaVersion: 2,
      rendererVersion: "0.1.2",
      chapters: [],
    });

    await expect(loader.getChapterBundle(chapterId, commitSha))
      .rejects.toBeInstanceOf(ChapterNotAvailableError);
  });

  it("uses the last known-good bundle when GitHub is unavailable", async () => {
    const cache = new MemoryCache();
    const previousBundle = bundle();
    cache.values.set(
      `notebooks:chapter-bundle:v2:last-good:${chapterId}`,
      JSON.stringify({ commitSha: previousCommitSha, bundle: previousBundle }),
    );
    const log = vi.fn();
    const loader = createChapterBundleLoader({
      cache,
      fetch: async () => {
        throw new Error("network unavailable");
      },
      log,
    });

    const result = await loader.getChapterBundle(chapterId, commitSha);

    expect(result).toEqual({
      bundle: previousBundle,
      sourceCommitSha: previousCommitSha,
      stale: true,
    });
    expect(log).toHaveBeenCalledWith(
      "Chapter bundle load failed; serving the last known-good bundle",
      expect.objectContaining({ reason: expect.stringContaining("network unavailable") }),
    );
  });

  it("throws a clear error when no valid bundle or fallback is available", async () => {
    const { loader } = loaderFor(new MemoryCache(), {
      schemaVersion: 2,
      id: chapterId,
    });

    await expect(loader.getChapterBundle(chapterId, commitSha))
      .rejects.toBeInstanceOf(ChapterBundleLoadError);
  });

  it("rejects an unpinned or malformed commit before making a request", async () => {
    const { fetcher, loader } = loaderFor(new MemoryCache());

    await expect(loader.getChapterBundle(chapterId, "main"))
      .rejects.toThrow("A full 40-character commit SHA is required");
    await expect(loader.getChapterBundle("../other", commitSha))
      .rejects.toThrow("Invalid chapter bundle ID");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
