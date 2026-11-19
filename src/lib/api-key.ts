import { createHash, randomBytes } from "node:crypto";

const API_KEY_PATTERN = /^nbv2_[A-Za-z0-9_-]{43}$/;

export function generateApiKey(): string {
  return `nbv2_${randomBytes(32).toString("base64url")}`;
}

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

export function parseApiKeyAuthorization(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(nbv2_[A-Za-z0-9_-]{43})$/.exec(header);
  if (!match || !API_KEY_PATTERN.test(match[1])) return null;
  return match[1];
}

export function isValidApiKeyId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
