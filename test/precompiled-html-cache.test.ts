import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { entries, redis } = vi.hoisted(() => {
  const entries = new Map<string, string>();
  const redis = {
    async get<T>(key: string): Promise<T | null> {
      const value = entries.get(key);
      return value === undefined ? null : JSON.parse(value) as T;
    },
    async set(key: string, value: unknown): Promise<"OK"> {
      entries.set(key, String(value));
      return "OK";
    },
  };
  return { entries, redis };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/public-index-cache", () => ({
  getRedisClient: () => redis,
}));

import {
  cachePrecompiledHtml,
  getCachedPrecompiledHtml,
  getLastKnownGoodPrecompiledHtml,
  getSupportedRendererVersion,
} from "../src/lib/precompiled-html-cache";

const html = '<article data-renderer-version="0.2.4"><h1>Chapter</h1></article>';

function blobSha(value: string): string {
  const body = Buffer.from(value, "utf8");
  return createHash("sha1").update(`blob ${body.byteLength}\0`).update(body).digest("hex");
}

describe("precompiled HTML cache", () => {
  beforeEach(() => {
    entries.clear();
  });

  it("extracts only renderer versions supported by the runtime", () => {
    expect(getSupportedRendererVersion(html)).toBe("0.2.4");
    expect(() => getSupportedRendererVersion('<article data-renderer-version="0.3.0"></article>'))
      .toThrow("missing or unsupported renderer version");
  });

  it("stores compressed verified HTML by SHA and renderer version with a last-good path pointer", async () => {
    const fileSha = blobSha(html);
    const commitSha = "b".repeat(40);

    await cachePrecompiledHtml("owner", "repo", "AI-NOTES/chapter.html", {
      branch: "main",
      commitSha,
      fileSha,
    }, html);

    await expect(getCachedPrecompiledHtml(fileSha)).resolves.toEqual({
      html,
      rendererVersion: "0.2.4",
    });
    await expect(getLastKnownGoodPrecompiledHtml("owner", "repo", "AI-NOTES/chapter.html"))
      .resolves.toEqual({
        branch: "main",
        commitSha,
        fileSha,
        html,
        rendererVersion: "0.2.4",
      });
    expect([...entries.values()].some((value) => value.includes("<article"))).toBe(false);
  });

  it("rejects HTML whose body does not match the catalog blob SHA", async () => {
    await expect(cachePrecompiledHtml("owner", "repo", "chapter.html", {
      branch: "main",
      commitSha: "b".repeat(40),
      fileSha: "a".repeat(40),
    }, html)).rejects.toThrow("SHA metadata is invalid");
  });
});
