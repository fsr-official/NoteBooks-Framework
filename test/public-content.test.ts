import { beforeEach, describe, expect, it, vi } from "vitest";

const { readPublicIndex } = vi.hoisted(() => ({
  readPublicIndex: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/public-index-cache", () => ({ readPublicIndex }));
vi.mock("@/lib/file-download", () => ({
  FileDownloadError: class FileDownloadError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
}));
vi.mock("@/lib/verified-pdf-cache", () => ({
  getOrFetchVerifiedPdf: vi.fn(),
}));

import { getCatalogFile } from "../src/lib/public-content";

function index(entries: Record<string, unknown>): string {
  return JSON.stringify({ schemaVersion: 1, entries });
}

describe("getCatalogFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readPublicIndex.mockImplementation(async (name: string) => {
      if (name === "github_repositories") {
        return index({
          "owner/repo": {
            owner: "owner",
            repoName: "repo",
            classOrStream: "science",
            branch: "main",
          },
        });
      }
      if (name === "science-tree") {
        return index({
          "owner/repo/notes/chapter.md": {
            repository: "owner/repo",
            filePath: "notes/chapter.md",
            branch: "main",
            fileSha: "a".repeat(40),
          },
        });
      }
      return null;
    });
  });

  it("shares index reads across concurrent file lookups", async () => {
    const files = await Promise.all([
      getCatalogFile("owner", "repo", "notes/chapter.md"),
      getCatalogFile("owner", "repo", "notes/chapter.md"),
    ]);

    expect(files[0]).toEqual(files[1]);
    expect(files[0]?.fileSha).toBe("a".repeat(40));
    expect(readPublicIndex).toHaveBeenCalledTimes(2);
  });
});
