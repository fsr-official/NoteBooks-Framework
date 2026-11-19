import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { getRedisClient } from "@/lib/public-index-cache";

type AiRateLimitScope = "account" | "anonymous-ip" | "anonymous-browser";

const POLICIES = {
  account: [
    { limit: 12, window: "15 m" },
    { limit: 60, window: "1 d" },
  ],
  "anonymous-ip": [
    { limit: 6, window: "15 m" },
    { limit: 20, window: "1 d" },
  ],
  "anonymous-browser": [
    { limit: 10, window: "15 m" },
    { limit: 35, window: "1 d" },
  ],
} as const;

const limiters = new Map<string, Ratelimit>();

export async function consumeAiChatRateLimit(
  scope: AiRateLimitScope,
  identifier: string,
) {
  const results = await Promise.all(POLICIES[scope].map(async (policy) => {
    const key = `${scope}:${policy.window}`;
    let limiter = limiters.get(key);
    if (!limiter) {
      limiter = new Ratelimit({
        redis: getRedisClient(),
        limiter: Ratelimit.slidingWindow(policy.limit, policy.window),
        prefix: `notebooks:ai-chat-rate-limit:v1:${scope}:${policy.window.replaceAll(" ", "-")}`,
      });
      limiters.set(key, limiter);
    }
    return limiter.limit(identifier);
  }));
  const rejected = results.find((result) => !result.success);
  if (!rejected) {
    return {
      allowed: true as const,
      remaining: Math.min(...results.map((result) => result.remaining)),
    };
  }
  return {
    allowed: false as const,
    retryAfterSeconds: Math.max(1, Math.ceil((rejected.reset - Date.now()) / 1000)),
    remaining: 0,
  };
}
