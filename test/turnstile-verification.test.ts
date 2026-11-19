import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TURNSTILE_TEST_SECRET_KEY,
  TURNSTILE_TEST_SITE_KEY,
  isTurnstileTestConfiguration,
  isTurnstileTestSecret,
  isTurnstileVerificationValid,
} from "../src/lib/turnstile-policy";
import { verifyTurnstileToken } from "../src/lib/turnstile-verification";

describe("verifyTurnstileToken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("posts tokens to Cloudflare and returns action and hostname metadata", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        action: "email-change",
        hostname: "notebooks-framework.vercel.app",
      }), { status: 200 }),
    );

    await expect(verifyTurnstileToken("challenge-token")).resolves.toEqual({
      success: true,
      action: "email-change",
      hostname: "notebooks-framework.vercel.app",
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(options?.method).toBe("POST");
    expect(new URLSearchParams(String(options?.body))).toEqual(new URLSearchParams({
      secret: "test-secret",
      response: "challenge-token",
    }));
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("fails explicitly when the secret is missing or Cloudflare rejects the request", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    await expect(verifyTurnstileToken("challenge-token")).rejects.toThrow("TURNSTILE_SECRET_KEY");

    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));
    await expect(verifyTurnstileToken("challenge-token")).rejects.toThrow("status 503");
  });

  it("accepts Cloudflare's documented localhost test response only with the exact test-key pair", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", TURNSTILE_TEST_SITE_KEY);
    vi.stubEnv("TURNSTILE_SECRET_KEY", TURNSTILE_TEST_SECRET_KEY);
    const localTestResponse = { success: true, hostname: "example.com" };

    expect(isTurnstileTestConfiguration()).toBe(true);
    expect(isTurnstileVerificationValid(localTestResponse, "email-change", "localhost")).toBe(true);
    expect(isTurnstileVerificationValid(
      { ...localTestResponse, action: "email-change" },
      "email-change",
      "localhost",
    )).toBe(false);
    expect(isTurnstileVerificationValid(
      { ...localTestResponse, hostname: "attacker.example" },
      "email-change",
      "localhost",
    )).toBe(false);
  });

  it("does not allow test-key responses to bypass production checks", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", TURNSTILE_TEST_SITE_KEY);
    vi.stubEnv("TURNSTILE_SECRET_KEY", TURNSTILE_TEST_SECRET_KEY);

    expect(isTurnstileTestConfiguration()).toBe(false);
    expect(isTurnstileTestSecret(TURNSTILE_TEST_SECRET_KEY)).toBe(true);
    expect(isTurnstileVerificationValid(
      { success: true, hostname: "example.com" },
      "email-change",
      "notebooks-framework.vercel.app",
    )).toBe(false);
    await expect(verifyTurnstileToken("test-token")).rejects.toThrow("cannot be used in production");
  });
});
