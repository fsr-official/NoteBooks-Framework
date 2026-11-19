import "server-only";

import { getRedisClient } from "@/lib/public-index-cache";

const API_KEY_BUCKET_SCRIPT = `
local time = redis.call("TIME")
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local capacity = tonumber(ARGV[1])
local refill_per_ms = tonumber(ARGV[2])
local ttl_seconds = tonumber(ARGV[3])
local state = redis.call("HMGET", KEYS[1], "tokens", "updated_at")
local tokens = tonumber(state[1]) or capacity
local updated_at = tonumber(state[2]) or now
local elapsed = math.max(0, now - updated_at)
tokens = math.min(capacity, tokens + elapsed * refill_per_ms)
local allowed = 0
local retry_after_ms = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  retry_after_ms = math.ceil((1 - tokens) / refill_per_ms)
end
redis.call("HSET", KEYS[1], "tokens", tokens, "updated_at", now)
redis.call("EXPIRE", KEYS[1], ttl_seconds)
return {allowed, math.floor(tokens), retry_after_ms}
`;

export interface ApiKeyRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export async function consumeApiKeyRateLimit(
  apiKeyId: string,
  options: { limit?: number; windowSeconds?: number } = {},
): Promise<ApiKeyRateLimitResult> {
  const limit = options.limit ?? 60;
  const windowSeconds = options.windowSeconds ?? 60;
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new Error("API rate-limit configuration must use positive integers");
  }

  const redis = getRedisClient();
  const refillPerMillisecond = limit / (windowSeconds * 1000);
  const result = await redis.eval<unknown[]>(
    API_KEY_BUCKET_SCRIPT,
    [`notebooks:api-rate:v1:${apiKeyId}`],
    [String(limit), String(refillPerMillisecond), String(windowSeconds * 2)],
  );
  if (
    !Array.isArray(result)
    || result.length !== 3
    || !result.every((value) => typeof value === "number")
  ) {
    throw new Error("Redis returned an invalid API rate-limit result");
  }

  const [allowed, remaining, retryAfterMilliseconds] = result;
  return {
    allowed: allowed === 1,
    limit,
    remaining,
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMilliseconds / 1000)),
  };
}
