import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  consumeApiKeyRateLimit,
  hashApiKey,
  parseApiKeyAuthorization,
  cacheFileContent,
  getCachedFileContent,
  fetchVerifiedMarkdownFile,
  normalizeMarkdownPath,
  getRedisClient,
  createSupabaseAdminClient,
  from,
  rpc,
  redisSet,
  redisDel,
} = vi.hoisted(() => ({
  consumeApiKeyRateLimit: vi.fn(),
  hashApiKey: vi.fn(),
  parseApiKeyAuthorization: vi.fn(),
  cacheFileContent: vi.fn(),
  getCachedFileContent: vi.fn(),
  fetchVerifiedMarkdownFile: vi.fn(),
  normalizeMarkdownPath: vi.fn(),
  getRedisClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  redisSet: vi.fn(),
  redisDel: vi.fn(),
}));

vi.mock("@/lib/api-rate-limit", () => ({ consumeApiKeyRateLimit }));
vi.mock("@/lib/api-key", () => ({ hashApiKey, parseApiKeyAuthorization }));
vi.mock("@/lib/file-content-cache", () => ({ cacheFileContent, getCachedFileContent }));
vi.mock("@/lib/file-download", () => ({
  FileDownloadError: class FileDownloadError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  fetchVerifiedMarkdownFile,
  normalizeMarkdownPath,
}));
vi.mock("@/lib/public-index-cache", () => ({ getRedisClient }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

import { GET } from "../src/app/api/v1/files/route";

const file = {
  branch: "main",
  file_path: "notes/chapter.md",
  file_sha: "a".repeat(40),
  last_commit_sha: "b".repeat(40),
  repo_name: "repo",
  repo_owner: "owner",
};

function configureSupabase(keyRecord: unknown, fileRows: unknown, error: unknown = null) {
  let updating = false;
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => updating ? Promise.resolve({ error: null }) : query),
    update: vi.fn(() => {
      updating = true;
      return query;
    }),
    maybeSingle: vi.fn(async () => ({ data: keyRecord, error })),
  };
  from.mockReturnValue(query);
  rpc.mockResolvedValue({ data: fileRows, error: null });
}

function request(query = "owner=owner&repo=repo&path=notes%2Fchapter.md", authorization: string | null = "Bearer token") {
  const headers = authorization ? { authorization } : undefined;
  return new Request(`https://example.test/api/v1/files?${query}`, { headers });
}

describe("GET /api/v1/files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeMarkdownPath.mockImplementation((path: string) => path.startsWith("../") ? null : path);
    parseApiKeyAuthorization.mockReturnValue("nbv2_test-key");
    hashApiKey.mockReturnValue("hashed-key");
    consumeApiKeyRateLimit.mockResolvedValue({ allowed: true, limit: 60, remaining: 59, retryAfterSeconds: 1 });
    getCachedFileContent.mockResolvedValue("# Chapter");
    redisSet.mockResolvedValue("OK");
    redisDel.mockResolvedValue(1);
    getRedisClient.mockReturnValue({ set: redisSet, del: redisDel });
    createSupabaseAdminClient.mockReturnValue({ from, rpc });
    configureSupabase({ id: "key-id", expires_at: null }, [file]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates required single query parameters before authentication", async () => {
    const invalid = await GET(request("owner=owner&owner=other&repo=repo&path=notes.md"));
    expect(invalid.status).toBe(400);
    expect(parseApiKeyAuthorization).not.toHaveBeenCalled();

    const invalidPath = await GET(request("owner=owner&repo=repo&path=../secret.md"));
    expect(invalidPath.status).toBe(400);
  });

  it("requires a bearer API key and rejects inactive keys", async () => {
    parseApiKeyAuthorization.mockReturnValue(null);
    const unauthorized = await GET(request(undefined, null));
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("WWW-Authenticate")).toBe("Bearer");

    parseApiKeyAuthorization.mockReturnValue("nbv2_test-key");
    configureSupabase(null, null);
    expect((await GET(request())).status).toBe(401);
  });

  it("returns the catalogued Markdown with integrity and rate-limit headers", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/markdown");
    expect(response.headers.get("X-File-SHA")).toBe(file.file_sha);
    expect(response.headers.get("X-Repository")).toBe("owner/repo");
    expect(response.headers.get("RateLimit-Remaining")).toBe("59");
    expect(response.headers.get("ETag")).toBe(`"${file.file_sha}"`);
    expect(response.headers.get("Content-Disposition")).toContain("chapter.md");
    expect(await response.text()).toBe("# Chapter");
    expect(rpc).toHaveBeenCalledWith("get_public_file_download", {
      p_repo_owner: "owner",
      p_repo_name: "repo",
      p_file_path: "notes/chapter.md",
    });
  });

  it("supports conditional responses and verifies uncached downloads", async () => {
    const conditional = await GET(new Request(
      "https://example.test/api/v1/files?owner=owner&repo=repo&path=notes%2Fchapter.md",
      { headers: { authorization: "Bearer token", "if-none-match": `"${file.file_sha}"` } },
    ));
    expect(conditional.status).toBe(304);

    getCachedFileContent.mockResolvedValueOnce(null);
    fetchVerifiedMarkdownFile.mockResolvedValueOnce("# downloaded");
    const downloaded = await GET(request());
    expect(downloaded.status).toBe(200);
    expect(await downloaded.text()).toBe("# downloaded");
    expect(fetchVerifiedMarkdownFile).toHaveBeenCalledWith(expect.objectContaining({
      owner: "owner",
      repository: "repo",
      commitSha: file.last_commit_sha,
      path: file.file_path,
      expectedBlobSha: file.file_sha,
    }));
    expect(cacheFileContent).toHaveBeenCalledWith(file.file_sha, "# downloaded");
  });

  it("returns 404 for missing catalog files and 429 when the key is rate limited", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect((await GET(request())).status).toBe(404);

    consumeApiKeyRateLimit.mockResolvedValue({
      allowed: false,
      limit: 60,
      remaining: 0,
      retryAfterSeconds: 7,
    });
    const limited = await GET(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("7");
  });
});
