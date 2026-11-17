import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_TEST_SECRET_KEY, TURNSTILE_TEST_SITE_KEY } from "../src/lib/turnstile-policy";

const { getAuthenticatedAccount, verifyTurnstileToken, consumeAuthRateLimit } = vi.hoisted(() => ({
  getAuthenticatedAccount: vi.fn(),
  verifyTurnstileToken: vi.fn(),
  consumeAuthRateLimit: vi.fn(),
}));

vi.mock("@/lib/authenticated-account", () => ({ getAuthenticatedAccount }));
vi.mock("@/lib/auth-rate-limit", () => ({ consumeAuthRateLimit }));
vi.mock("@/lib/turnstile-verification", () => ({ verifyTurnstileToken }));

import { POST } from "../src/app/api/account/email/route";

function makeRequest(body: unknown) {
  return new Request("https://example.test/api/account/email", {
    method: "POST",
    headers: { authorization: "Bearer user-access-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedAccount.mockResolvedValue({
      accountId: "alex_studies",
      role: "user",
      user: { id: "auth-user-id" },
    });
    consumeAuthRateLimit.mockResolvedValue({
      allowed: true,
      limit: 3,
      remaining: 2,
      retryAfterSeconds: 30,
    });
    verifyTurnstileToken.mockResolvedValue({
      success: true,
      action: "email-change",
      hostname: "notebooks-framework.vercel.app",
    });
    process.env.APP_BASE_URL = "https://notebooks-framework.vercel.app";
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies Turnstile for an authenticated email-change request", async () => {
    const response = await POST(makeRequest({ captchaToken: "valid-token" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ verified: true });
    expect(consumeAuthRateLimit).toHaveBeenCalledWith("email-change", "auth-user-id");
    expect(verifyTurnstileToken).toHaveBeenCalledWith("valid-token");
  });

  it("rejects unsuccessful or wrong-action CAPTCHA tokens and unauthenticated users", async () => {
    verifyTurnstileToken.mockResolvedValueOnce({
      success: false,
      action: "email-change",
      hostname: "notebooks-framework.vercel.app",
    });

    expect((await POST(makeRequest({ captchaToken: "invalid-token" }))).status).toBe(403);
    verifyTurnstileToken.mockResolvedValueOnce({
      success: true,
      action: "signup",
      hostname: "notebooks-framework.vercel.app",
    });
    expect((await POST(makeRequest({ captchaToken: "wrong-action-token" }))).status).toBe(403);
    getAuthenticatedAccount.mockResolvedValueOnce(null);
    expect((await POST(makeRequest({ captchaToken: "valid-token" }))).status).toBe(401);
  });

  it("rejects a valid token issued for another hostname", async () => {
    verifyTurnstileToken.mockResolvedValueOnce({
      success: true,
      action: "email-change",
      hostname: "attacker.example",
    });

    expect((await POST(makeRequest({ captchaToken: "valid-token" }))).status).toBe(403);
  });

  it("accepts Cloudflare's documented dummy-key response outside production", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", TURNSTILE_TEST_SITE_KEY);
    vi.stubEnv("TURNSTILE_SECRET_KEY", TURNSTILE_TEST_SECRET_KEY);
    verifyTurnstileToken.mockResolvedValueOnce({
      success: true,
      hostname: "example.com",
    });

    expect((await POST(makeRequest({ captchaToken: "XXXX.DUMMY.TOKEN.XXXX" }))).status).toBe(200);
  });

  it("rejects missing CAPTCHA tokens", async () => {
    expect((await POST(makeRequest({}))).status).toBe(400);
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
  });

  it("rate limits authenticated email-change attempts before Turnstile verification", async () => {
    consumeAuthRateLimit.mockResolvedValueOnce({
      allowed: false,
      limit: 3,
      remaining: 0,
      retryAfterSeconds: 57,
    });

    const response = await POST(makeRequest({ captchaToken: "valid-token" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("57");
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
  });
});
