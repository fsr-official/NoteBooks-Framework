import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCatalogFile,
  getCachedFileContent,
  fetchVerifiedTextFile,
  cachePrecompiledHtml,
  getCachedPrecompiledHtml,
  getLastKnownGoodPrecompiledHtml,
} = vi.hoisted(() => ({
  getCatalogFile: vi.fn(),
  getCachedFileContent: vi.fn(),
  fetchVerifiedTextFile: vi.fn(),
  cachePrecompiledHtml: vi.fn(),
  getCachedPrecompiledHtml: vi.fn(),
  getLastKnownGoodPrecompiledHtml: vi.fn(),
}));

vi.mock("@/lib/public-content", () => ({
  fetchVerifiedMedia: vi.fn(),
  getCatalogFile,
  mediaContentType: vi.fn(() => null),
  normalizeCatalogPath: vi.fn((path: string) => path),
  textContentType: vi.fn(() => "text/markdown; charset=utf-8"),
}));
vi.mock("@/lib/file-content-cache", () => ({
  cacheFileContent: vi.fn(),
  getCachedFileContent,
}));
vi.mock("@/lib/file-download", () => ({
  FileDownloadError: class FileDownloadError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
  fetchVerifiedTextFile,
  normalizeRepositoryPath: vi.fn((path: string) => path),
}));
vi.mock("@/lib/media-range", () => ({
  createMediaResponse: vi.fn(),
  parseByteRange: vi.fn(),
}));
vi.mock("@/lib/precompiled-html-cache", () => ({
  cachePrecompiledHtml,
  getCachedPrecompiledHtml,
  getLastKnownGoodPrecompiledHtml,
  getSupportedRendererVersion: (html: string) => {
    const version = /data-renderer-version="([^"]+)"/.exec(html)?.[1];
    if (!version) throw new Error("Missing renderer version");
    return version;
  },
}));

import { servePublicContent } from "../src/lib/public-content-route";

describe("servePublicContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCatalogFile.mockResolvedValue({
      branch: "release/2026",
      filePath: "notes/chapter.md",
      fileSha: "a".repeat(40),
      owner: "owner",
      repository: "repo",
    });
    getCachedFileContent.mockResolvedValue("# Chapter");
    getCachedPrecompiledHtml.mockResolvedValue(null);
    getLastKnownGoodPrecompiledHtml.mockResolvedValue(null);
  });

  it("returns catalog metadata including the authoritative repository branch", async () => {
    const request = new Request("https://example.test/api/raw?owner=owner&repo=repo&path=notes%2Fchapter.md");
    const response = await servePublicContent(request, "markdown");

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Repository-Branch")).toBe("release/2026");
    expect(await response.text()).toBe("# Chapter");
  });

  it("requires and uses a pinned repository commit for compiled HTML", async () => {
    const commitSha = "b".repeat(40);
    getCatalogFile.mockResolvedValueOnce({
      branch: "main",
      commitSha,
      filePath: "AI-NOTES/chapter.html",
      fileSha: "a".repeat(40),
      owner: "owner",
      repository: "repo",
    });
    getCachedFileContent.mockResolvedValueOnce(null);
    fetchVerifiedTextFile.mockResolvedValueOnce('<article data-renderer-version="0.2.4">compiled</article>');
    const request = new Request("https://example.test/api/raw?owner=owner&repo=repo&path=AI-NOTES%2Fchapter.html");

    const response = await servePublicContent(request, "markdown");

    expect(response.status).toBe(200);
    expect(fetchVerifiedTextFile).toHaveBeenCalledWith(expect.objectContaining({ commitSha }));
    expect(response.headers.get("X-Repository-Commit-SHA")).toBe(commitSha);
    expect(await response.text()).toBe('<article data-renderer-version="0.2.4">compiled</article>');
    expect(cachePrecompiledHtml).toHaveBeenCalledWith(
      "owner",
      "repo",
      "AI-NOTES/chapter.html",
      expect.objectContaining({ commitSha }),
      '<article data-renderer-version="0.2.4">compiled</article>',
    );
  });

  it("does not fetch compiled HTML when the repository commit SHA is unavailable", async () => {
    getCatalogFile.mockResolvedValueOnce({
      branch: "main",
      filePath: "AI-NOTES/chapter.html",
      fileSha: "a".repeat(40),
      owner: "owner",
      repository: "repo",
    });
    const request = new Request("https://example.test/api/raw?owner=owner&repo=repo&path=AI-NOTES%2Fchapter.html");

    const response = await servePublicContent(request, "markdown");

    expect(response.status).toBe(503);
    expect(fetchVerifiedTextFile).not.toHaveBeenCalled();
  });

  it("serves the last verified HTML when fetching the indexed version fails", async () => {
    const latestCommitSha = "c".repeat(40);
    getCatalogFile.mockResolvedValueOnce({
      branch: "main",
      commitSha: "b".repeat(40),
      filePath: "AI-NOTES/chapter.html",
      fileSha: "d".repeat(40),
      owner: "owner",
      repository: "repo",
    });
    fetchVerifiedTextFile.mockRejectedValueOnce(new Error("GitHub unavailable"));
    getLastKnownGoodPrecompiledHtml.mockResolvedValueOnce({
      branch: "main",
      commitSha: latestCommitSha,
      fileSha: "a".repeat(40),
      html: '<article data-renderer-version="0.2.4">last good</article>',
      rendererVersion: "0.2.4",
    });
    const request = new Request("https://example.test/api/raw?owner=owner&repo=repo&path=AI-NOTES%2Fchapter.html");

    const response = await servePublicContent(request, "markdown");

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Compiled-HTML-Stale")).toBe("true");
    expect(response.headers.get("X-File-SHA")).toBe("a".repeat(40));
    expect(response.headers.get("X-Repository-Commit-SHA")).toBe(latestCommitSha);
    expect(await response.text()).toBe('<article data-renderer-version="0.2.4">last good</article>');
  });
});
