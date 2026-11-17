import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCatalogFile, getCachedFileContent } = vi.hoisted(() => ({
  getCatalogFile: vi.fn(),
  getCachedFileContent: vi.fn(),
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
  fetchVerifiedTextFile: vi.fn(),
  normalizeRepositoryPath: vi.fn((path: string) => path),
}));
vi.mock("@/lib/media-range", () => ({
  createMediaResponse: vi.fn(),
  parseByteRange: vi.fn(),
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
  });

  it("returns catalog metadata including the authoritative repository branch", async () => {
    const request = new Request("https://example.test/api/raw?owner=owner&repo=repo&path=notes%2Fchapter.md");
    const response = await servePublicContent(request, "markdown");

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Repository-Branch")).toBe("release/2026");
    expect(await response.text()).toBe("# Chapter");
  });
});
