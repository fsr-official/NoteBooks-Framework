import "server-only";

import { getRedisClient } from "@/lib/public-index-cache";

const FILE_CONTENT_TTL_SECONDS = 24 * 60 * 60;

function cacheKey(fileSha: string): string {
  return `notebooks:file-content:v1:${fileSha}`;
}

export async function getCachedFileContent(fileSha: string): Promise<string | null> {
  const value = await getRedisClient().get<unknown>(cacheKey(fileSha));
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error("Redis returned an invalid cached file body");
  }
  return value;
}

export async function cacheFileContent(fileSha: string, content: string): Promise<void> {
  await getRedisClient().set(
    cacheKey(fileSha),
    JSON.stringify(content),
    { ex: FILE_CONTENT_TTL_SECONDS },
  );
}
