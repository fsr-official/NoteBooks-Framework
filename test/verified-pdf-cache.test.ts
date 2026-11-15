import { describe, expect, it } from "vitest";
import { getOrFetchVerifiedPdf } from "../src/lib/verified-pdf-cache";

describe("verified PDF cache", () => {
  it("reuses a verified body for the same file SHA", async () => {
    const fileSha = "a".repeat(40);
    const body = new Uint8Array([1, 2, 3]);
    let fetchCount = 0;
    const fetchVerified = async () => {
      fetchCount += 1;
      return body;
    };

    await expect(getOrFetchVerifiedPdf(fileSha, fetchVerified)).resolves.toBe(body);
    await expect(getOrFetchVerifiedPdf(fileSha, fetchVerified)).resolves.toBe(body);
    expect(fetchCount).toBe(1);
  });

  it("coalesces concurrent fetches for the same file SHA", async () => {
    const fileSha = "b".repeat(40);
    const body = new Uint8Array([4, 5, 6]);
    let fetchCount = 0;
    let resolveFetch: ((value: Uint8Array) => void) | undefined;
    const fetchVerified = () => {
      fetchCount += 1;
      return new Promise<Uint8Array>((resolve) => {
        resolveFetch = resolve;
      });
    };

    const first = getOrFetchVerifiedPdf(fileSha, fetchVerified);
    const second = getOrFetchVerifiedPdf(fileSha, fetchVerified);
    expect(fetchCount).toBe(1);
    resolveFetch?.(body);
    await expect(Promise.all([first, second])).resolves.toEqual([body, body]);
  });

  it("does not cache a failed fetch and allows a retry", async () => {
    const fileSha = "c".repeat(40);
    const body = new Uint8Array([7, 8, 9]);
    await expect(getOrFetchVerifiedPdf(fileSha, async () => {
      throw new Error("upstream unavailable");
    })).rejects.toThrow("upstream unavailable");

    await expect(getOrFetchVerifiedPdf(fileSha, async () => body)).resolves.toBe(body);
  });
});
