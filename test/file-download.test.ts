import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  fetchVerifiedMarkdownFile,
  fetchVerifiedTextFile,
  normalizeMarkdownPath,
  normalizeRepositoryPath,
} from "../src/lib/file-download";

const fileContent = "# Chapter 1\n\nBody.\n";
const blobSha = createHash("sha1")
  .update(Buffer.from(`blob ${Buffer.byteLength(fileContent)}\0`))
  .update(fileContent)
  .digest("hex");

describe("Markdown file download", () => {
  it("normalizes safe Markdown file paths and rejects traversal/non-Markdown inputs", () => {
    expect(normalizeMarkdownPath("Physics/Chapter 1.md")).toBe("Physics/Chapter 1.md");
    expect(normalizeMarkdownPath("../secret.md")).toBeNull();
    expect(normalizeMarkdownPath("/absolute.md")).toBeNull();
    expect(normalizeMarkdownPath("notes/image.png")).toBeNull();
    expect(normalizeRepositoryPath("src/components/reader.tsx")).toBe("src/components/reader.tsx");
    expect(normalizeRepositoryPath("../secret.txt")).toBeNull();
  });

  it("fetches content pinned to the commit and verifies the Git blob SHA", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(fileContent));
    const result = await fetchVerifiedMarkdownFile({
      owner: "owner",
      repository: "repo",
      commitSha: "a".repeat(40),
      path: "notes/chapter 1.md",
      expectedBlobSha: blobSha,
      token: "github-test-token",
      fetcher,
    });

    expect(result).toBe(fileContent);
    expect(fetcher.mock.calls[0][0]).toBe(
      `https://raw.githubusercontent.com/owner/repo/${"a".repeat(40)}/notes/chapter%201.md`,
    );
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer github-test-token",
    });
  });

  it("can safely resolve non-Markdown text at the indexed branch ref", async () => {
    const source = "export const answer = 42;\n";
    const sourceSha = createHash("sha1")
      .update(Buffer.from(`blob ${Buffer.byteLength(source)}\0`))
      .update(source)
      .digest("hex");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(source));
    const result = await fetchVerifiedTextFile({
      owner: "owner",
      repository: "repo",
      commitSha: "release/v2",
      path: "src/answer.ts",
      expectedBlobSha: sourceSha,
      fetcher,
    });

    expect(result).toBe(source);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://raw.githubusercontent.com/owner/repo/release/v2/src/answer.ts",
    );
  });

  it("rejects content that does not match the catalog blob SHA", async () => {
    await expect(fetchVerifiedMarkdownFile({
      owner: "owner",
      repository: "repo",
      commitSha: "a".repeat(40),
      path: "notes/chapter.md",
      expectedBlobSha: "b".repeat(40),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(fileContent)),
    })).rejects.toThrow("does not match the catalog SHA");
  });
});
