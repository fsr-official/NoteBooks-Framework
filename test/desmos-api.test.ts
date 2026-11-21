import { afterEach, describe, expect, it, vi } from "vitest";
import { getDesmosApiScript } from "../src/lib/desmos-api";

describe("getDesmosApiScript", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(["graphing", "3d"] as const)("loads the official shared API script for %s", async (kind) => {
    vi.stubEnv("DESMOS_API_KEY", "test-api-key");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("window.Desmos = {};", { status: 200 }),
    );

    const response = await getDesmosApiScript(kind);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/javascript");
    await expect(response.text()).resolves.toContain("window.Desmos");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.desmos.com/api/v1.11.4/calculator.js?apiKey=test-api-key",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
