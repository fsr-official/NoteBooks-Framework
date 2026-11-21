import "server-only";

import { getRedisClient } from "@/lib/public-index-cache";
import { createChapterBundleLoader } from "./index";

const loader = createChapterBundleLoader({
  cache: {
    async get(key) {
      const value = await getRedisClient().get<unknown>(key);
      if (value === null) return null;
      if (typeof value !== "string") {
        throw new Error(`Chapter bundle cache value is not a serialized string: ${key}`);
      }
      return value;
    },
    async set(key, value, ttlSeconds) {
      const redis = getRedisClient();
      if (ttlSeconds === undefined) {
        await redis.set(key, value);
      } else {
        await redis.set(key, value, { ex: ttlSeconds });
      }
    },
  },
});

export const getChapterBundle = loader.getChapterBundle;
