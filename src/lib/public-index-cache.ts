import "server-only";

import { Redis } from "@upstash/redis";
import type { PublicIndexName, PublicIndexStore } from "@/lib/public-indexes";
import { createUpstashPublicIndexStore } from "@/lib/upstash-public-index-store";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();
  if (!url || !token) {
    throw new Error("KV_REST_API_URL and KV_REST_API_TOKEN must be configured");
  }
  redisClient ??= new Redis({ url, token });
  return redisClient;
}

export function getPublicIndexStore(): PublicIndexStore {
  return createUpstashPublicIndexStore(getRedisClient());
}

export async function readPublicIndex(
  name: PublicIndexName,
  format: "json" | "jsonl",
): Promise<string | null> {
  return getPublicIndexStore().get(`notebooks:public-index:v1:${name}:${format}`);
}
