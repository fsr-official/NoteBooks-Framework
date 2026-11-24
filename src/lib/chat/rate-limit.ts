import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { getRedisClient } from "@/lib/public-index-cache";

// Burst protection on top of the per-message cooldown (see store.ts).
const POLICIES = [
  { limit: 20, window: "1 m" },
  { limit: 300, window: "1 d" },
] as const;

const limiters = new Map<string, Ratelimit>();

export async function consumeChatRateLimit(accountHash: string) {
  const results = await Promise.all(POLICIES.map(async (policy) => {
    let limiter = limiters.get(policy.window);
    if (!limiter) {
      limiter = new Ratelimit({
        redis: getRedisClient(),
        limiter: Ratelimit.slidingWindow(policy.limit, policy.window),
        prefix: `notebooks:chat-rate-limit:v1:${policy.window.replaceAll(" ", "-")}`,
      });
      limiters.set(policy.window, limiter);
    }
    return limiter.limit(accountHash);
  }));
  const rejected = results.find((result) => !result.success);
  if (!rejected) return { allowed: true as const };
  return {
    allowed: false as const,
    retryAfterSeconds: Math.max(1, Math.ceil((rejected.reset - Date.now()) / 1000)),
  };
}
