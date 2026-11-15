import { afterEach, describe, expect, it, vi } from "vitest";

const { readPublicIndex } = vi.hoisted(() => ({ readPublicIndex: vi.fn() }));
vi.mock("@/lib/public-index-cache", () => ({ readPublicIndex }));

import { GET } from "../src/app/api/public/json/[filename]/route";

function context(filename: string) {
  return { params: Promise.resolve({ filename }) };
}

describe("GET /api/public/json/[filename]", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves generated JSON with cache and content-type headers", async () => {
    readPublicIndex.mockResolvedValue('{"entries":{}}');
    const response = await GET(
      new Request("https://example.test/api/public/json/science-tree.json"),
      context("science-tree.json"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=300");
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toBe('{"entries":{}}');
    expect(readPublicIndex).toHaveBeenCalledWith("science-tree", "json");
  });

  it("serves JSONL using its streaming content type", async () => {
    readPublicIndex.mockResolvedValue('{"path":"one.md"}\n');
    const response = await GET(
      new Request("https://example.test/api/public/json/science-tree.jsonl"),
      context("science-tree.jsonl"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
    expect(readPublicIndex).toHaveBeenCalledWith("science-tree", "jsonl");
  });

  it("redirects legacy class indexes to the consolidated index", async () => {
    const response = await GET(
      new Request("https://example.test/api/public/json/classnine-tree.json"),
      context("classnine-tree.json"),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe(
      "https://example.test/api/public/json/lowersecondary-tree.json",
    );
    expect(readPublicIndex).not.toHaveBeenCalled();
  });

  it("rejects unknown files, reports missing indexes, and surfaces store failures", async () => {
    const unknown = await GET(
      new Request("https://example.test/api/public/json/private.json"),
      context("private.json"),
    );
    expect(unknown.status).toBe(404);

    readPublicIndex.mockResolvedValueOnce(null);
    const missing = await GET(
      new Request("https://example.test/api/public/json/science-tree.json"),
      context("science-tree.json"),
    );
    expect(missing.status).toBe(503);
    expect(missing.headers.get("Retry-After")).toBe("30");

    vi.spyOn(console, "error").mockImplementation(() => {});
    readPublicIndex.mockRejectedValueOnce(new Error("Redis unavailable"));
    const failed = await GET(
      new Request("https://example.test/api/public/json/science-tree.json"),
      context("science-tree.json"),
    );
    expect(failed.status).toBe(503);
    await expect(failed.json()).resolves.toEqual({ error: "Unable to retrieve public index" });
  });
});
