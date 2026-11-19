import { describe, expect, it } from "vitest";
import { getAuthCaptchaToken } from "../src/lib/auth-captcha";

describe("getAuthCaptchaToken", () => {
  it("allows local development without a configured widget", () => {
    expect(getAuthCaptchaToken("", { siteKey: "", isProduction: false })).toBeUndefined();
  });

  it("requires a configured widget in production", () => {
    expect(() => getAuthCaptchaToken("", { siteKey: "", isProduction: true }))
      .toThrow("Security verification is not configured");
  });

  it("requires a completed challenge when configured", () => {
    expect(() => getAuthCaptchaToken("", { siteKey: "site-key", isProduction: false }))
      .toThrow("Complete the security check");
  });

  it("returns the challenge token for Supabase Auth", () => {
    expect(getAuthCaptchaToken("turnstile-token", { siteKey: "site-key", isProduction: true }))
      .toBe("turnstile-token");
  });
});
