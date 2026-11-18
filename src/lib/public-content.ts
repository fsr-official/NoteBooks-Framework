import "server-only";

import { createHash } from "node:crypto";
import { FileDownloadError } from "@/lib/file-download";
import { isTreeGroup, type PublicIndexName, type TreeGroup } from "@/lib/public-indexes";
import { readPublicIndex } from "@/lib/public-index-cache";
import { parseByteRange } from "@/lib/media-range";
import { getOrFetchVerifiedPdf } from "@/lib/verified-pdf-cache";

const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const MAX_MEDIA_BYTES = 32 * 1024 * 1024;
const MEDIA_TIMEOUT_MS = 20_000;

export interface CatalogFile {
  branch: string;
  filePath: string;
  fileSha: string;
  owner: string;
  repository: string;
}

interface IndexDocument {
  schemaVersion: number;
  entries: Record<string, unknown>;
}

const PUBLIC_INDEX_CACHE_TTL_MS = 15_000;
const publicIndexCache = new Map<PublicIndexName, { document: IndexDocument; expiresAt: number }>();
const pendingIndexReads = new Map<PublicIndexName, Promise<IndexDocument>>();

async function readParsedPublicIndex(name: PublicIndexName, label: string): Promise<IndexDocument> {
  const cached = publicIndexCache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.document;

  const pending = pendingIndexReads.get(name);
  if (pending) return pending;

  const request = (async () => {
    try {
      const document = parseIndex(await readPublicIndex(name, "json"), label);
      publicIndexCache.set(name, {
        document,
        expiresAt: Date.now() + PUBLIC_INDEX_CACHE_TTL_MS,
      });
      return document;
    } finally {
      pendingIndexReads.delete(name);
    }
  })();
  pendingIndexReads.set(name, request);
  return request;
}

const MEDIA_TYPES: Record<string, string> = {
  bmp: "image/bmp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  flac: "audio/flac",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  m4a: "audio/mp4",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  ogg: "audio/ogg",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  svg: "image/svg+xml",
  wav: "audio/wav",
  webm: "video/webm",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function normalizeCatalogPath(value: string): string | null {
  if (!value || value.length > 1024 || value.includes("\0")) return null;
  const normalized = value.replace(/\\/g, "/");
  if (normalized.startsWith("/")) return null;
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return normalized;
}

export function mediaContentType(path: string): string | null {
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  return MEDIA_TYPES[extension] ?? null;
}

export function textContentType(path: string): string | null {
  return /\.(?:md|markdown|mdx)$/i.test(path)
    ? "text/markdown; charset=utf-8"
    : "text/plain; charset=utf-8";
}

export async function getCatalogFile(
  owner: string,
  repository: string,
  path: string,
): Promise<CatalogFile | null> {
  const repositoryIndex = await readParsedPublicIndex("github_repositories", "repository");
  const repositoryRow = asRecord(repositoryIndex.entries[`${owner}/${repository}`]);
  if (
    !repositoryRow
    || repositoryRow.owner !== owner
    || repositoryRow.repoName !== repository
    || !isTreeGroup(repositoryRow.classOrStream)
    || typeof repositoryRow.branch !== "string"
  ) return null;

  const group = repositoryRow.classOrStream as TreeGroup;
  const treeName = `${group}-tree` as PublicIndexName;
  const treeIndex = await readParsedPublicIndex(treeName, `${group} file tree`);
  const fileRow = asRecord(treeIndex.entries[`${owner}/${repository}/${path}`]);
  if (
    !fileRow
    || fileRow.repository !== `${owner}/${repository}`
    || fileRow.filePath !== path
    || typeof fileRow.branch !== "string"
    || typeof fileRow.fileSha !== "string"
    || !SHA_PATTERN.test(fileRow.fileSha)
  ) return null;
  return {
    branch: fileRow.branch,
    filePath: fileRow.filePath,
    fileSha: fileRow.fileSha.toLowerCase(),
    owner,
    repository,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseIndex(value: string | null, label: string): IndexDocument {
  if (value === null) throw new Error(`The public ${label} index is not available in Redis`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`The public ${label} index is malformed`, { cause: error });
  }
  const document = asRecord(parsed);
  const entries = document ? asRecord(document.entries) : null;
  if (document?.schemaVersion !== 1 || !entries) {
    throw new Error(`The public ${label} index has an unsupported format`);
  }
  return { schemaVersion: 1, entries };
}

async function readMediaBody(response: Response): Promise<Uint8Array> {
  if (!response.body) throw new FileDownloadError("GitHub returned an empty media response", 502);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_MEDIA_BYTES) {
        await reader.cancel();
        throw new FileDownloadError("Media file exceeds the 32 MiB limit", 413);
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

function gitBlobSha(contents: Uint8Array): string {
  return createHash("sha1").update(`blob ${contents.byteLength}\0`).update(contents).digest("hex");
}

function parseLfsPointer(contents: Uint8Array): { oid: string; size: number } | null {
  const pointer = new TextDecoder().decode(contents);
  const match = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\nsize (\d+)(?:\r?\n)?$/i.exec(pointer);
  if (!match) return null;
  const size = Number(match[2]);
  return Number.isSafeInteger(size) ? { oid: match[1].toLowerCase(), size } : null;
}

async function fetchLfsMedia(
  file: CatalogFile,
  pointer: { oid: string; size: number },
  contentType: string,
  rangeHeader: string | null,
): Promise<Response> {
  const encodedPath = file.filePath.split("/").map(encodeURIComponent).join("/");
  const encodedBranch = file.branch.split("/").map(encodeURIComponent).join("/");
  const url = new URL(`https://media.githubusercontent.com/media/${encodeURIComponent(file.owner)}/${encodeURIComponent(file.repository)}/refs/heads/${encodedBranch}/${encodedPath}`);
  url.searchParams.set("sha", pointer.oid);

  const requestedRange = parseByteRange(rangeHeader, pointer.size);
  if (requestedRange?.kind === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes */${pointer.size}`,
        ETag: `"${file.fileSha}"`,
      },
    });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/octet-stream",
        "User-Agent": "NoteBooks-Framework-v2",
        ...(requestedRange?.kind === "range"
          ? { Range: `bytes=${requestedRange.start}-${requestedRange.end}` }
          : {}),
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      signal: controller.signal,
    });
  } catch {
    throw new FileDownloadError("Unable to resolve large media on GitHub", 502);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new FileDownloadError(`GitHub returned HTTP ${response.status} for large media`, 502);
  const etag = response.headers.get("etag")?.replace(/^"|"$/g, "").toLowerCase();
  const contentLength = Number(response.headers.get("content-length"));
  const contentRange = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") ?? "");
  const rangeMatches = requestedRange?.kind === "range"
    && response.status === 206
    && contentRange
    && Number(contentRange[1]) === requestedRange.start
    && Number(contentRange[2]) === requestedRange.end
    && Number(contentRange[3]) === pointer.size
    && Number.isSafeInteger(contentLength)
    && contentLength === requestedRange.end - requestedRange.start + 1;
  const fullBodyMatches = response.status === 200
    && Number.isSafeInteger(contentLength)
    && contentLength === pointer.size;
  if (etag !== pointer.oid || (!rangeMatches && !fullBodyMatches)) {
    throw new FileDownloadError("Large media does not match the repository LFS pointer", 502);
  }

  const headers = new Headers({
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
    "Content-Type": contentType,
    "Cross-Origin-Resource-Policy": "cross-origin",
    ETag: `"${file.fileSha}"`,
    "X-Content-Type-Options": "nosniff",
    "X-File-SHA": file.fileSha,
    "X-Repository": `${file.owner}/${file.repository}`,
    "Accept-Ranges": "bytes",
  });
  if (rangeMatches && contentRange) {
    headers.set("Content-Range", response.headers.get("content-range") ?? "");
    headers.set("Content-Length", String(contentLength));
  } else {
    headers.set("Content-Length", String(pointer.size));
  }
  if (contentType.startsWith("application/") && contentType !== "application/pdf") {
    headers.set("Content-Disposition", "attachment");
  }
  return new Response(response.body, { status: rangeMatches ? 206 : 200, headers });
}

export async function fetchVerifiedMedia(
  file: CatalogFile,
  contentType: string,
  rangeHeader: string | null = null,
): Promise<Uint8Array | Response> {
  const encodedPath = file.filePath.split("/").map(encodeURIComponent).join("/");
  const encodedRef = file.branch.split("/").map(encodeURIComponent).join("/");
  const url = `https://raw.githubusercontent.com/${encodeURIComponent(file.owner)}/${encodeURIComponent(file.repository)}/${encodedRef}/${encodedPath}`;

  if (contentType === "application/pdf") {
    const body = await getOrFetchVerifiedPdf(file.fileSha, async () => {
      let pdfResponse: Response;
      try {
        const headers: Record<string, string> = {
          Accept: "application/octet-stream",
          "User-Agent": "NoteBooks-Framework-v2",
        };
        if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
        pdfResponse = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
        });
      } catch (error) {
        throw new FileDownloadError(
          error instanceof Error && error.name === "TimeoutError"
            ? "Media request to GitHub timed out"
            : "Unable to retrieve media from GitHub",
          502,
        );
      }
      if (pdfResponse.status === 404) throw new FileDownloadError("Media file is no longer available upstream", 404);
      if (!pdfResponse.ok) throw new FileDownloadError(`GitHub returned HTTP ${pdfResponse.status}`, 502);
      const pdfBody = await readMediaBody(pdfResponse);
      if (gitBlobSha(pdfBody) !== file.fileSha) {
        throw new FileDownloadError("Media content does not match the catalog SHA", 502);
      }
      return pdfBody;
    });
    const lfsPointer = parseLfsPointer(body);
    if (lfsPointer) return fetchLfsMedia(file, lfsPointer, contentType, rangeHeader);
    return body;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/octet-stream",
        "User-Agent": "NoteBooks-Framework-v2",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
    });
  } catch (error) {
    throw new FileDownloadError(
      error instanceof Error && error.name === "TimeoutError"
        ? "Media request to GitHub timed out"
        : "Unable to retrieve media from GitHub",
      502,
    );
  }
  if (response.status === 404) throw new FileDownloadError("Media file is no longer available upstream", 404);
  if (!response.ok) throw new FileDownloadError(`GitHub returned HTTP ${response.status}`, 502);

  const body = await readMediaBody(response);
  if (gitBlobSha(body) !== file.fileSha) {
    throw new FileDownloadError("Media content does not match the catalog SHA", 502);
  }
  const lfsPointer = parseLfsPointer(body);
  if (lfsPointer) return fetchLfsMedia(file, lfsPointer, contentType, rangeHeader);
  return body;
}
