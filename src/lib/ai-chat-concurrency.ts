import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getRedisClient } from "@/lib/public-index-cache";

const LOCK_PREFIX = "notebooks:ai-chat-inflight:v1";
const LOCK_TTL_MS = 180_000;
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

export type AiChatRequestLockScope = "account" | "anonymous-browser";

export async function acquireAiChatRequestLock(
  scope: AiChatRequestLockScope,
  identifier: string,
): Promise<(() => Promise<void>) | null> {
  const identifierHash = createHash("sha256").update(identifier).digest("hex");
  const key = `${LOCK_PREFIX}:${scope}:${identifierHash}`;
  const token = randomUUID();
  const redis = getRedisClient();
  const acquired = await redis.set(key, token, { nx: true, px: LOCK_TTL_MS });
  if (acquired !== "OK") return null;

  return async () => {
    await redis.eval(RELEASE_LOCK_SCRIPT, [key], [token]);
  };
}
