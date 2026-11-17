import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { getRedisClient } from "@/lib/public-index-cache";

export const AUTH_RATE_LIMITS = {
  "email-signup": { limit: 5, window: "1 h" },
  "password-login": { limit: 10, window: "5 m" },
  "signup-code-resend": { limit: 3, window: "1 h" },
  "signup-code-verify": { limit: 10, window: "5 m" },
  "password-reset": { limit: 5, window: "1 h" },
  "email-change": { limit: 3, window: "1 h" },
} as const;

export type AuthRateLimitAction = keyof typeof AUTH_RATE_LIMITS;

const limiters = new Map<AuthRateLimitAction, Ratelimit>();

export async function consumeAuthRateLimit(
  action: AuthRateLimitAction,
  identifier: string,
) {
  let limiter = limiters.get(action);
  if (!limiter) {
    const policy = AUTH_RATE_LIMITS[action];
    limiter = new Ratelimit({
      redis: getRedisClient(),
      limiter: Ratelimit.slidingWindow(policy.limit, policy.window),
      prefix: `notebooks:auth-rate-limit:v1:${action}`,
    });
    limiters.set(action, limiter);
  }
  const result = await limiter.limit(identifier);
  return {
    allowed: result.success,
    limit: result.limit,
    remaining: result.remaining,
    retryAfterSeconds: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
  };
}
