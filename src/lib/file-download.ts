import { createHash } from "node:crypto";

const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const GIT_REF_PATTERN = /^[A-Za-z0-9._/-]{1,255}$/;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const FILE_FETCH_TIMEOUT_MS = 15_000;

export class FileDownloadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function normalizeMarkdownPath(value: string): string | null {
  const normalized = normalizeRepositoryPath(value);
  if (!normalized || !/\.(?:md|markdown|mdx)$/i.test(normalized.split("/").at(-1) ?? "")) return null;
  return normalized;
}

export function normalizeRepositoryPath(value: string): string | null {
  if (!value || value.length > 1024 || value.includes("\0")) return null;
  const normalized = value.replace(/\\/g, "/");
  if (normalized.startsWith("/")) return null;
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return segments.join("/");
}

function gitBlobSha(contents: Uint8Array): string {
  const header = Buffer.from(`blob ${contents.byteLength}\0`, "utf8");
  return createHash("sha1").update(header).update(contents).digest("hex");
}

function isSafeGitRef(value: string): boolean {
  return GIT_REF_PATTERN.test(value)
    && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".." && !segment.endsWith(".lock"));
}

async function readLimitedBody(response: Response): Promise<Uint8Array> {
  if (!response.body) throw new FileDownloadError("GitHub returned an empty response body", 502);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FILE_BYTES) {
        await reader.cancel();
        throw new FileDownloadError("Text file exceeds the 2 MiB API limit", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function fetchVerifiedTextFile(options: {
  owner: string;
  repository: string;
  commitSha: string;
  path: string;
  expectedBlobSha: string;
  token?: string;
  fetcher?: typeof fetch;
}): Promise<string> {
  const {
    owner,
    repository,
    commitSha,
    path,
    expectedBlobSha,
    token,
    fetcher = fetch,
  } = options;
  if (!isSafeGitRef(commitSha) || !GIT_SHA_PATTERN.test(expectedBlobSha)) {
    throw new FileDownloadError("Repository file metadata is invalid", 502);
  }

  const normalizedPath = normalizeRepositoryPath(path);
  if (!normalizedPath) throw new FileDownloadError("Repository file path is invalid", 400);
  const encodedPath = normalizedPath.split("/").map(encodeURIComponent).join("/");
  const encodedRef = commitSha.split("/").map(encodeURIComponent).join("/");
  const url = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/${encodedRef}/${encodedPath}`;
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: {
        Accept: "text/plain",
        "User-Agent": "NoteBooks-Framework-v2",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(FILE_FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new FileDownloadError("Unable to retrieve file from GitHub", 502);
  }
  if (response.status === 404) throw new FileDownloadError("File is no longer available upstream", 404);
  if (!response.ok) throw new FileDownloadError(`GitHub returned HTTP ${response.status}`, 502);

  const contents = await readLimitedBody(response);
  if (gitBlobSha(contents) !== expectedBlobSha.toLowerCase()) {
    throw new FileDownloadError("File content does not match the catalog SHA", 502);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(contents);
  } catch {
    throw new FileDownloadError("Text file is not valid UTF-8", 502);
  }
}

export async function fetchVerifiedMarkdownFile(options: {
  owner: string;
  repository: string;
  commitSha: string;
  path: string;
  expectedBlobSha: string;
  token?: string;
  fetcher?: typeof fetch;
}): Promise<string> {
  const normalizedPath = normalizeMarkdownPath(options.path);
  if (!normalizedPath) throw new FileDownloadError("Markdown file path is invalid", 400);
  return fetchVerifiedTextFile({ ...options, path: normalizedPath });
}
