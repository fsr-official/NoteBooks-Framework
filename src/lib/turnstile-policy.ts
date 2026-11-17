import type { TurnstileVerification } from "@/lib/turnstile-verification";

export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

const TURNSTILE_TEST_SECRETS = new Set([
  TURNSTILE_TEST_SECRET_KEY,
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

export function isTurnstileTestConfiguration(): boolean {
  return process.env.NODE_ENV !== "production"
    && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY === TURNSTILE_TEST_SITE_KEY
    && process.env.TURNSTILE_SECRET_KEY === TURNSTILE_TEST_SECRET_KEY;
}

export function isTurnstileTestSecret(secret: string): boolean {
  return TURNSTILE_TEST_SECRETS.has(secret);
}

export function isTurnstileVerificationValid(
  result: TurnstileVerification,
  action: string,
  hostname: string,
): boolean {
  if (!result.success) return false;
  if (isTurnstileTestConfiguration()) {
    return result.hostname === "example.com" && result.action === undefined;
  }
  return result.action === action && result.hostname === hostname;
}
