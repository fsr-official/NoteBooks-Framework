import "server-only";

import { isTurnstileTestSecret } from "@/lib/turnstile-policy";

export interface TurnstileVerification {
  success: boolean;
  action?: string;
  hostname?: string;
}

export async function verifyTurnstileToken(token: string): Promise<TurnstileVerification> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    throw new Error("TURNSTILE_SECRET_KEY must be configured on the server.");
  }
  if (process.env.NODE_ENV === "production" && isTurnstileTestSecret(secret)) {
    throw new Error("A Cloudflare Turnstile test secret cannot be used in production.");
  }

  const body = new URLSearchParams({ secret, response: token });
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Turnstile verification failed with status ${response.status}.`);
  }

  const result = await response.json() as {
    success?: unknown;
    action?: unknown;
    hostname?: unknown;
  };
  return {
    success: result.success === true,
    ...(typeof result.action === "string" ? { action: result.action } : {}),
    ...(typeof result.hostname === "string" ? { hostname: result.hostname } : {}),
  };
}
