import { describe, expect, it } from "vitest";
import { createMediaResponse, parseByteRange } from "../src/lib/media-range";

const bytes = new TextEncoder().encode("0123456789");

describe("media byte ranges", () => {
  it("parses explicit, open-ended, and suffix byte ranges", () => {
    expect(parseByteRange("bytes=2-5", bytes.byteLength)).toEqual({ kind: "range", start: 2, end: 5 });
    expect(parseByteRange("bytes=7-", bytes.byteLength)).toEqual({ kind: "range", start: 7, end: 9 });
    expect(parseByteRange("bytes=-3", bytes.byteLength)).toEqual({ kind: "range", start: 7, end: 9 });
  });

  it("ignores malformed and multi-range requests", () => {
    expect(parseByteRange("items=0-1", bytes.byteLength)).toBeNull();
    expect(parseByteRange("bytes=0-1,4-5", bytes.byteLength)).toBeNull();
  });

  it("returns a valid partial response for PDF viewers", async () => {
    const request = new Request("https://example.test/api/media", {
      headers: { Range: "bytes=2-5" },
    });
    const response = createMediaResponse(request, bytes, new Headers({
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
    }));

    expect(response.status).toBe(206);
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(response.headers.get("Content-Length")).toBe("4");
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe("2345");
  });

  it("returns 416 when a requested range starts beyond the file", () => {
    const response = createMediaResponse(
      new Request("https://example.test/api/media", { headers: { Range: "bytes=10-" } }),
      bytes,
      new Headers(),
    );
    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */10");
  });

  it("returns headers without a body for HEAD requests", () => {
    const response = createMediaResponse(
      new Request("https://example.test/api/media", { method: "HEAD" }),
      bytes,
      new Headers(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Length")).toBe("10");
    expect(response.body).toBeNull();
  });
});
