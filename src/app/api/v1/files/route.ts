import { NextResponse } from "next/server";
import { consumeApiKeyRateLimit } from "@/lib/api-rate-limit";
import { hashApiKey, parseApiKeyAuthorization } from "@/lib/api-key";
import { cacheFileContent, getCachedFileContent } from "@/lib/file-content-cache";
import { FileDownloadError, fetchVerifiedMarkdownFile, normalizeMarkdownPath } from "@/lib/file-download";
import { getRedisClient } from "@/lib/public-index-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

interface FileMetadata {
  branch: string;
  file_path: string;
  file_sha: string;
  last_commit_sha: string;
  repo_name: string;
  repo_owner: string;
}

function isFileMetadata(value: unknown): value is FileMetadata {
  if (!value || typeof value !== "object") return false;
  const file = value as Record<string, unknown>;
  return typeof file.branch === "string"
    && typeof file.file_path === "string"
    && typeof file.file_sha === "string"
    && typeof file.last_commit_sha === "string"
    && typeof file.repo_name === "string"
    && typeof file.repo_owner === "string";
}

function responseError(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...headers,
      },
    },
  );
}

function requiredSingleQueryValue(url: URL, name: string): string | null {
  const values = url.searchParams.getAll(name);
  return values.length === 1 && values[0].trim() ? values[0] : null;
}

async function getFile(request: Request) {
  const url = new URL(request.url);
  const owner = requiredSingleQueryValue(url, "owner")?.trim() ?? null;
  const repository = requiredSingleQueryValue(url, "repo")?.trim() ?? null;
  const requestedPath = requiredSingleQueryValue(url, "path");
  const filePath = requestedPath ? normalizeMarkdownPath(requestedPath) : null;
  if (!owner || !repository || !filePath
      || !/^[\w.-]{1,100}$/.test(owner)
      || !/^[\w.-]{1,100}$/.test(repository)) {
    return responseError("Provide valid owner, repo, and Markdown path query parameters", 400);
  }

  const apiKey = parseApiKeyAuthorization(request.headers.get("authorization"));
  if (!apiKey) {
    return responseError(
      "A valid API key is required in the Authorization: Bearer header",
      401,
      { "WWW-Authenticate": "Bearer" },
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: keyRecord, error: keyError } = await supabase
    .from("api_keys")
    .select("id, expires_at")
    .eq("key_hash", hashApiKey(apiKey))
    .is("revoked_at", null)
    .maybeSingle();
  if (keyError) {
    console.error("API key validation query failed", keyError);
    return responseError("Unable to validate API key", 503);
  }
  if (
    !keyRecord
    || (typeof keyRecord.expires_at === "string" && Date.parse(keyRecord.expires_at) <= Date.now())
  ) {
    return responseError("Invalid or expired API key", 401, { "WWW-Authenticate": "Bearer" });
  }
  if (typeof keyRecord.id !== "string") {
    console.error("API key validation returned an invalid record");
    return responseError("Unable to validate API key", 503);
  }

  let rateLimit;
  try {
    rateLimit = await consumeApiKeyRateLimit(keyRecord.id);
  } catch (error) {
    console.error("API key rate limiter unavailable", error);
    return responseError("API rate limiter is unavailable", 503);
  }
  const rateHeaders = {
    "RateLimit-Limit": String(rateLimit.limit),
    "RateLimit-Remaining": String(rateLimit.remaining),
    ...(rateLimit.allowed ? {} : { "Retry-After": String(rateLimit.retryAfterSeconds) }),
  };
  if (!rateLimit.allowed) {
    return responseError("API key request limit exceeded", 429, rateHeaders);
  }

  const { data: fileRows, error: fileError } = await supabase.rpc("get_public_file_download", {
    p_repo_owner: owner,
    p_repo_name: repository,
    p_file_path: filePath,
  });
  if (fileError) {
    console.error("File catalog lookup failed", fileError);
    return responseError("Unable to look up requested file", 503, rateHeaders);
  }
  const file = Array.isArray(fileRows) ? fileRows[0] : null;
  if (!file) return responseError("Markdown file not found", 404, rateHeaders);
  if (!isFileMetadata(file) || !/^[a-f0-9]{40}$/i.test(file.file_sha)
      || !/^[a-f0-9]{40}$/i.test(file.last_commit_sha)) {
    console.error("File catalog returned invalid download metadata");
    return responseError("File metadata is unavailable", 502, rateHeaders);
  }

  const etag = `"${file.file_sha}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ...rateHeaders,
        ETag: etag,
        "Cache-Control": "private, no-store",
      },
    });
  }

  let content: string;
  try {
    const cachedContent = await getCachedFileContent(file.file_sha);
    if (cachedContent !== null) {
      content = cachedContent;
    } else {
      content = await fetchVerifiedMarkdownFile({
        owner: file.repo_owner,
        repository: file.repo_name,
        commitSha: file.last_commit_sha,
        path: file.file_path,
        expectedBlobSha: file.file_sha,
        token: process.env.GITHUB_TOKEN || process.env.GITHUB_PAT,
      });
      await cacheFileContent(file.file_sha, content);
    }
  } catch (error) {
    if (error instanceof FileDownloadError) {
      return responseError(error.message, error.status, rateHeaders);
    }
    console.error("File content retrieval failed", error);
    return responseError("File content service is unavailable", 503, rateHeaders);
  }

  try {
    const redis = getRedisClient();
    const touchMarker = await redis.set(
      `notebooks:api-key:last-used:v1:${keyRecord.id}`,
      "1",
      { ex: 300, nx: true },
    );
    if (touchMarker === "OK") {
      const { error: usageError } = await supabase
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", keyRecord.id)
        .is("revoked_at", null);
      if (usageError) {
        await redis.del(`notebooks:api-key:last-used:v1:${keyRecord.id}`);
        console.error("API key last-used timestamp update failed", usageError);
        return responseError("Unable to record API key usage", 503, rateHeaders);
      }
    }
  } catch (error) {
    console.error("API key usage tracking failed", error);
    return responseError("API key usage tracking is unavailable", 503, rateHeaders);
  }

  return new Response(content, {
    headers: {
      ...rateHeaders,
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.file_path.split("/").at(-1)!)}`,
      "Content-Length": String(Buffer.byteLength(content)),
      "Content-Type": "text/markdown; charset=utf-8",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
      "X-File-SHA": file.file_sha,
      "X-Repository": `${file.repo_owner}/${file.repo_name}`,
    },
  });
}

export const GET = withApiTelemetry("/api/v1/files", "GET", getFile);
