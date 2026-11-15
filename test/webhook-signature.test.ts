import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "../src/lib/webhook-signature";

describe("webhook signature verification", () => {
  const body = '{"repository":"owner/repo","branch":"main"}';
  const secret = "test-webhook-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  it("accepts a matching HMAC signature", () => {
    expect(verifyWebhookSignature(body, signature, secret)).toBe(true);
  });

  it("rejects a signature for a different body or secret", () => {
    expect(verifyWebhookSignature(`${body} `, signature, secret)).toBe(false);
    expect(verifyWebhookSignature(body, signature, "wrong-secret")).toBe(false);
  });

  it("rejects absent and malformed signatures", () => {
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=invalid", secret)).toBe(false);
  });
});
