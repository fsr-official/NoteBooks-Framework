import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { consumeAuthRateLimit } = vi.hoisted(() => ({
  consumeAuthRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth-rate-limit", () => ({ consumeAuthRateLimit }));
vi.mock("@/lib/api-telemetry", () => ({
  withApiTelemetry: (_route: string, _method: string, handler: (request: Request) => unknown) => handler,
}));

import { POST } from "../src/app/api/account/auth-rate-limit/route";

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/account/auth-rate-limit", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/auth-rate-limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    consumeAuthRateLimit.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      retryAfterSeconds: 30,
    });

  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("applies a hashed client IP to the selected action", async () => {
    const response = await POST(makeRequest(
      { action: "password-login" },
      { "x-real-ip": "203.0.113.10" },
    ));

    expect(response.status).toBe(200);
    expect(consumeAuthRateLimit).toHaveBeenCalledWith(
      "password-login",
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(response.headers.get("RateLimit-Remaining")).toBe("9");
  });

  it("rejects unsupported actions and missing production IPs", async () => {
    expect((await POST(makeRequest({ action: "chat-send" }, { "x-real-ip": "203.0.113.10" }))).status).toBe(400);
    expect((await POST(makeRequest({ action: "password-login" }))).status).toBe(503);
    expect(consumeAuthRateLimit).not.toHaveBeenCalled();
  });

  it("returns retry metadata when an action exceeds its limit", async () => {
    consumeAuthRateLimit.mockResolvedValueOnce({
      allowed: false,
      limit: 10,
      remaining: 0,
      retryAfterSeconds: 47,
    });

    const response = await POST(makeRequest(
      { action: "password-login" },
      { "x-forwarded-for": "198.51.100.8, 203.0.113.1" },
    ));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("47");
  });
});
