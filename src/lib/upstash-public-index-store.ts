import { Redis } from "@upstash/redis";
import type { PublicIndexStore } from "@/lib/public-indexes";

export function encodePublicIndexValue(value: string): string {
  return JSON.stringify(value);
}

export function createUpstashPublicIndexStore(redis: Redis): PublicIndexStore {
  return {
    get: async (key) => {
      const value = await redis.get<unknown>(key);
      if (value === null) return null;
      if (typeof value !== "string") {
        throw new Error(`Public index cache value is not a serialized string: ${key}`);
      }
      return value;
    },
    set: (key, value) => redis.set(key, encodePublicIndexValue(value)),
    setMany: async (entries) => {
      const pipeline = redis.pipeline();
      for (const { key, value } of entries) {
        pipeline.set(key, encodePublicIndexValue(value));
      }
      return pipeline.exec();
    },
  };
}
