import {
  parseChapterBundle,
  parseChapterManifest,
  sourceShasMatch,
  type ChapterBundle,
  type ChapterManifest,
} from "./schema";

const REPOSITORY = "fsr-official/NoteBooks-Developers";
const RAW_BASE_URL = `https://raw.githubusercontent.com/${REPOSITORY}`;
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const CHAPTER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface ChapterBundleCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
}

export interface ChapterBundleDependencies {
  cache: ChapterBundleCache;
  fetch?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  log?: (message: string, context: Record<string, unknown>) => void;
}

export type ChapterBundleResult = {
  bundle: ChapterBundle;
  sourceCommitSha: string;
  stale: boolean;
};

export class ChapterBundleLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ChapterBundleLoadError";
  }
}

export class ChapterNotAvailableError extends Error {
  constructor(chapterId: string) {
    super(`Chapter "${chapterId}" is not listed in the pinned bundle manifest`);
    this.name = "ChapterNotAvailableError";
  }
}

type LastKnownGood = { commitSha: string; bundle: ChapterBundle };

function cacheKey(kind: "manifest" | "bundle", commitSha: string, rendererVersion?: string, chapterId?: string): string {
  if (kind === "manifest") return `notebooks:chapter-bundle:v2:manifest:${commitSha}`;
  return `notebooks:chapter-bundle:v2:bundle:${commitSha}:${rendererVersion}:${chapterId}`;
}

function lastKnownGoodKey(chapterId: string): string {
  return `notebooks:chapter-bundle:v2:last-good:${chapterId}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function manifestEntry(manifest: ChapterManifest, chapterId: string) {
  return manifest.chapters.find((chapter) => chapter.id === chapterId);
}

function verifyBundle(
  bundle: ChapterBundle,
  entry: ChapterManifest["chapters"][number],
  manifest: ChapterManifest,
): void {
  if (bundle.id !== entry.id
    || bundle.title !== entry.title
    || bundle.rendererVersion !== manifest.rendererVersion
    || !sourceShasMatch(bundle.sourceShas, entry.sourceShas)) {
    throw new Error("Chapter bundle metadata or source SHAs do not match the pinned manifest");
  }
}

export function createChapterBundleLoader(dependencies: ChapterBundleDependencies) {
  const fetcher = dependencies.fetch ?? fetch;
  const log = dependencies.log ?? ((message, context) => console.error(message, context));

  async function readCached<T>(
    key: string,
    label: string,
    parse: (value: unknown) => T,
  ): Promise<T | null> {
    try {
      const serialized = await dependencies.cache.get(key);
      if (serialized === null) return null;
      try {
        return parse(JSON.parse(serialized) as unknown);
      } catch (error) {
        log(`Ignoring invalid cached ${label}`, { key, reason: errorMessage(error) });
        return null;
      }
    } catch (error) {
      log(`Unable to read cached ${label}`, { key, reason: errorMessage(error) });
      return null;
    }
  }

  async function writeCached(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      await dependencies.cache.set(key, JSON.stringify(value), ttlSeconds);
    } catch (error) {
      log("Unable to cache chapter bundle data", { key, reason: errorMessage(error) });
    }
  }

  async function fetchJson(url: string, label: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "NoteBooks-Framework-v2",
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new Error(`Unable to fetch ${label}: ${errorMessage(error)}`, { cause: error });
    }
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status} for ${label}`);
    try {
      return await response.json() as unknown;
    } catch (error) {
      throw new Error(`GitHub returned invalid JSON for ${label}`, { cause: error });
    }
  }

  async function readManifest(commitSha: string): Promise<ChapterManifest> {
    const key = cacheKey("manifest", commitSha);
    const cached = await readCached(key, "chapter manifest", parseChapterManifest);
    if (cached) return cached;

    const url = `${RAW_BASE_URL}/${commitSha}/build/manifest.json`;
    const manifest = parseChapterManifest(await fetchJson(url, "chapter manifest"));
    await writeCached(key, manifest, CACHE_TTL_SECONDS);
    return manifest;
  }

  async function readLastKnownGood(chapterId: string): Promise<LastKnownGood | null> {
    const key = lastKnownGoodKey(chapterId);
    return readCached(key, "last-known-good chapter bundle", (value) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error("Invalid last-known-good bundle envelope");
      }
      const envelope = value as Record<string, unknown>;
      if (Object.keys(envelope).length !== 2
        || typeof envelope.commitSha !== "string"
        || !COMMIT_SHA_PATTERN.test(envelope.commitSha)) {
        throw new Error("Invalid last-known-good bundle metadata");
      }
      const lastKnownGood = {
        commitSha: envelope.commitSha.toLowerCase(),
        bundle: parseChapterBundle(envelope.bundle),
      };
      if (lastKnownGood.bundle.id !== chapterId) {
        throw new Error("Last-known-good bundle ID does not match its cache key");
      }
      return lastKnownGood;
    });
  }

  async function getChapterBundle(chapterId: string, pinnedCommitSha: string): Promise<ChapterBundleResult> {
    const commitSha = pinnedCommitSha.toLowerCase();
    if (!COMMIT_SHA_PATTERN.test(commitSha)) {
      throw new Error("A full 40-character commit SHA is required to fetch a chapter bundle");
    }
    if (!CHAPTER_ID_PATTERN.test(chapterId)) {
      throw new Error("Invalid chapter bundle ID");
    }

    try {
      const manifest = await readManifest(commitSha);
      const entry = manifestEntry(manifest, chapterId);
      if (!entry) {
        log("Chapter bundle is not in the pinned manifest", {
          chapterId,
          commitSha,
          reason: "manifest membership check failed",
        });
        throw new ChapterNotAvailableError(chapterId);
      }

      const key = cacheKey("bundle", commitSha, manifest.rendererVersion, chapterId);
      let cached = await readCached(key, "chapter bundle", parseChapterBundle);
      if (cached) {
        try {
          verifyBundle(cached, entry, manifest);
        } catch (error) {
          log("Ignoring chapter bundle cache that does not match its manifest", {
            key,
            reason: errorMessage(error),
          });
          cached = null;
        }
      }
      if (cached) {
        const envelope = { commitSha, bundle: cached };
        await writeCached(lastKnownGoodKey(chapterId), envelope);
        return { bundle: cached, sourceCommitSha: commitSha, stale: false };
      }

      const url = `${RAW_BASE_URL}/${commitSha}/build/${encodeURIComponent(entry.bundle)}`;
      const bundle = parseChapterBundle(await fetchJson(url, `chapter bundle "${chapterId}"`));
      verifyBundle(bundle, entry, manifest);
      const envelope = { commitSha, bundle };
      await writeCached(key, bundle, CACHE_TTL_SECONDS);
      await writeCached(lastKnownGoodKey(chapterId), envelope);
      return { bundle, sourceCommitSha: commitSha, stale: false };
    } catch (error) {
      if (error instanceof ChapterNotAvailableError) throw error;
      const reason = errorMessage(error);
      const lastKnownGood = await readLastKnownGood(chapterId);
      if (lastKnownGood) {
        log("Chapter bundle load failed; serving the last known-good bundle", {
          chapterId,
          commitSha,
          sourceCommitSha: lastKnownGood.commitSha,
          reason,
        });
        return {
          bundle: lastKnownGood.bundle,
          sourceCommitSha: lastKnownGood.commitSha,
          stale: true,
        };
      }
      log("Chapter bundle load failed and no last known-good bundle is available", {
        chapterId,
        commitSha,
        reason,
      });
      throw new ChapterBundleLoadError(
        `Unable to load chapter "${chapterId}" at ${commitSha}: ${reason}`,
        { cause: error },
      );
    }
  }

  return { getChapterBundle };
}
