import "server-only";

import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { MAX_COMPILED_HTML_BYTES } from "@/lib/file-download";
import { getRedisClient } from "@/lib/public-index-cache";

const CACHE_KEY_PREFIX = "notebooks:precompiled-html:v1";
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const VERSION_PATTERN = /^0\.2\.\d+$/;

export interface CachedPrecompiledHtml {
  branch: string;
  commitSha: string;
  fileSha: string;
  html: string;
  rendererVersion: string;
}

interface CompressedHtml {
  body: string;
  rendererVersion: string;
}

interface LatestHtmlPointer {
  branch: string;
  commitSha: string;
  fileSha: string;
  rendererVersion: string;
}

function contentKey(fileSha: string, rendererVersion: string): string {
  return `${CACHE_KEY_PREFIX}:content:${fileSha}:${rendererVersion}`;
}

function versionKey(fileSha: string): string {
  return `${CACHE_KEY_PREFIX}:version:${fileSha}`;
}

function pathKey(owner: string, repository: string, path: string): string {
  const identifier = `${owner.toLowerCase()}/${repository.toLowerCase()}/${path}`;
  return `${CACHE_KEY_PREFIX}:latest:${Buffer.from(identifier).toString("base64url")}`;
}

function encodeRedisJson(value: unknown): string {
  return JSON.stringify(JSON.stringify(value));
}

function parseJson(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "string") throw new Error(`Redis returned an invalid ${label}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`Redis returned malformed ${label}`, { cause: error });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Redis returned an invalid ${label}`);
  }
  return parsed as Record<string, unknown>;
}

function gitBlobSha(contents: string): string {
  const body = Buffer.from(contents, "utf8");
  return createHash("sha1").update(`blob ${body.byteLength}\0`).update(body).digest("hex");
}

export function getSupportedRendererVersion(html: string): string {
  const match = /<article\b[^>]*\bdata-renderer-version\s*=\s*(["'])([^"']+)\1/i.exec(html);
  if (!match || !VERSION_PATTERN.test(match[2])) {
    throw new Error("Compiled HTML has a missing or unsupported renderer version");
  }
  return match[2];
}

async function getCachedContent(
  fileSha: string,
  rendererVersion: string,
): Promise<string | null> {
  const value = await getRedisClient().get<unknown>(contentKey(fileSha, rendererVersion));
  if (value === null) return null;
  const record = parseJson(value, "compiled HTML cache entry");
  if (record.rendererVersion !== rendererVersion || typeof record.body !== "string") {
    throw new Error("Redis returned an invalid compiled HTML cache entry");
  }
  let html: string;
  try {
    html = gunzipSync(Buffer.from(record.body, "base64"), {
      maxOutputLength: MAX_COMPILED_HTML_BYTES,
    }).toString("utf8");
  } catch (error) {
    throw new Error("Redis returned a corrupt compiled HTML cache entry", { cause: error });
  }
  if (getSupportedRendererVersion(html) !== rendererVersion || gitBlobSha(html) !== fileSha) {
    throw new Error("Cached compiled HTML failed version or SHA verification");
  }
  return html;
}

export async function getCachedPrecompiledHtml(fileSha: string): Promise<{
  html: string;
  rendererVersion: string;
} | null> {
  if (!SHA_PATTERN.test(fileSha)) throw new Error("Compiled HTML cache lookup has an invalid SHA");
  const versionValue = await getRedisClient().get<unknown>(versionKey(fileSha));
  if (versionValue === null) return null;
  if (typeof versionValue !== "string" || !VERSION_PATTERN.test(versionValue)) {
    throw new Error("Redis returned an invalid compiled HTML renderer version");
  }
  const html = await getCachedContent(fileSha, versionValue);
  return html === null ? null : { html, rendererVersion: versionValue };
}

export async function cachePrecompiledHtml(
  owner: string,
  repository: string,
  path: string,
  file: Omit<CachedPrecompiledHtml, "html" | "rendererVersion">,
  html: string,
): Promise<void> {
  const rendererVersion = getSupportedRendererVersion(html);
  if (Buffer.byteLength(html, "utf8") > MAX_COMPILED_HTML_BYTES) {
    throw new Error("Compiled HTML exceeds the 8 MiB cache limit");
  }
  if (
    !SHA_PATTERN.test(file.fileSha)
    || !SHA_PATTERN.test(file.commitSha)
    || gitBlobSha(html) !== file.fileSha
  ) {
    throw new Error("Compiled HTML cannot be cached because its SHA metadata is invalid");
  }

  const redis = getRedisClient();
  await redis.set(
    contentKey(file.fileSha, rendererVersion),
    encodeRedisJson({
      body: gzipSync(Buffer.from(html, "utf8")).toString("base64"),
      rendererVersion,
    } satisfies CompressedHtml),
    { ex: CACHE_TTL_SECONDS },
  );
  await redis.set(versionKey(file.fileSha), JSON.stringify(rendererVersion), {
    ex: CACHE_TTL_SECONDS,
  });
  const pointer: LatestHtmlPointer = {
    branch: file.branch,
    commitSha: file.commitSha,
    fileSha: file.fileSha,
    rendererVersion,
  };
  await redis.set(pathKey(owner, repository, path), encodeRedisJson(pointer), {
    ex: CACHE_TTL_SECONDS,
  });
}

export async function getLastKnownGoodPrecompiledHtml(
  owner: string,
  repository: string,
  path: string,
): Promise<CachedPrecompiledHtml | null> {
  const value = await getRedisClient().get<unknown>(pathKey(owner, repository, path));
  if (value === null) return null;
  const pointer = parseJson(value, "last-known-good HTML pointer");
  if (
    typeof pointer.branch !== "string"
    || typeof pointer.commitSha !== "string"
    || !SHA_PATTERN.test(pointer.commitSha)
    || typeof pointer.fileSha !== "string"
    || !SHA_PATTERN.test(pointer.fileSha)
    || typeof pointer.rendererVersion !== "string"
    || !VERSION_PATTERN.test(pointer.rendererVersion)
  ) {
    throw new Error("Redis returned an invalid last-known-good HTML pointer");
  }
  const html = await getCachedContent(pointer.fileSha, pointer.rendererVersion);
  if (html === null) return null;
  return {
    branch: pointer.branch,
    commitSha: pointer.commitSha,
    fileSha: pointer.fileSha,
    html,
    rendererVersion: pointer.rendererVersion,
  };
}
