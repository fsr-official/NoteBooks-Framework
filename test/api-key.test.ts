import { describe, expect, it } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  isValidApiKeyId,
  parseApiKeyAuthorization,
} from "../src/lib/api-key";

describe("API key primitives", () => {
  it("generates a high-entropy key with the documented prefix and hashes it", () => {
    const apiKey = generateApiKey();
    expect(apiKey).toMatch(/^nbv2_[A-Za-z0-9_-]{43}$/);
    expect(hashApiKey(apiKey)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashApiKey(apiKey)).not.toBe(apiKey);
  });

  it("accepts API keys only through an exact bearer authorization value", () => {
    const apiKey = generateApiKey();
    expect(parseApiKeyAuthorization(`Bearer ${apiKey}`)).toBe(apiKey);
    expect(parseApiKeyAuthorization(null)).toBeNull();
    expect(parseApiKeyAuthorization(apiKey)).toBeNull();
    expect(parseApiKeyAuthorization(`Bearer ${apiKey} `)).toBeNull();
    expect(parseApiKeyAuthorization("Bearer nbv2_invalid")).toBeNull();
  });

  it("validates UUID API key identifiers", () => {
    expect(isValidApiKeyId("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isValidApiKeyId("not-a-uuid")).toBe(false);
  });
});
