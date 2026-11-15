import {
  fetchVerifiedTextFile,
  FileDownloadError,
  normalizeRepositoryPath,
} from "@/lib/file-download";
import {
  fetchVerifiedMedia,
  getCatalogFile,
  mediaContentType,
  normalizeCatalogPath,
  textContentType,
} from "@/lib/public-content";
import { cacheFileContent, getCachedFileContent } from "@/lib/file-content-cache";
import { createMediaResponse } from "@/lib/media-range";

type ContentKind = "markdown" | "media";

function errorResponse(message: string, status: number): Response {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function singleParameter(url: URL, name: string): string | null {
  const values = url.searchParams.getAll(name);
  return values.length === 1 && values[0].trim() ? values[0].trim() : null;
}

export async function servePublicContent(request: Request, kind: ContentKind): Promise<Response> {
  const url = new URL(request.url);
  let owner = singleParameter(url, "owner");
  let repository = singleParameter(url, "repo");
  if (repository?.includes("/")) {
    const [repoOwner, repoName, ...rest] = repository.split("/");
    if (owner || rest.length > 0) return errorResponse("Provide repo as owner/repository or separate owner and repo", 400);
    owner = repoOwner || null;
    repository = repoName || null;
  }
  const requestedPath = singleParameter(url, "path");
  const path = requestedPath
    ? kind === "markdown" ? normalizeRepositoryPath(requestedPath) : normalizeCatalogPath(requestedPath)
    : null;
  if (
    !owner
    || !repository
    || !path
    || !/^[\w.-]{1,100}$/.test(owner)
    || !/^[\w.-]{1,100}$/.test(repository)
  ) {
    return errorResponse("Provide valid owner, repo, and path query parameters", 400);
  }

  if (kind === "markdown" && /\.pdf$/i.test(path)) {
    return servePublicContent(request, "media");
  }

  const contentType = kind === "markdown" ? textContentType(path) : mediaContentType(path);
  if (!contentType) return errorResponse("Unsupported media file type", 415);

  try {
    const file = await getCatalogFile(owner, repository, path);
    if (!file) return errorResponse("Repository file not found", 404);

    const etag = `"${file.fileSha}"`;
    const headers = new Headers({
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
      "Content-Type": contentType,
      "Cross-Origin-Resource-Policy": "cross-origin",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
      "X-File-SHA": file.fileSha,
      "X-Repository": `${file.owner}/${file.repository}`,
    });
    if (contentType === "image/svg+xml") {
      headers.set("Content-Security-Policy", "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'");
    }
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers });
    }

    if (kind === "markdown") {
      let body = await getCachedFileContent(file.fileSha);
      if (body === null) {
        body = await fetchVerifiedTextFile({
          owner: file.owner,
          repository: file.repository,
          commitSha: file.branch,
          path: file.filePath,
          expectedBlobSha: file.fileSha,
          token: process.env.GITHUB_TOKEN,
        });
        await cacheFileContent(file.fileSha, body);
      }
      return new Response(body, { headers });
    }

    const ifRange = request.headers.get("if-range");
    const rangeHeader = ifRange && ifRange !== etag ? null : request.headers.get("range");
    const body = await fetchVerifiedMedia(file, contentType, rangeHeader);
    if (body instanceof Response) {
      const mediaHeaders = new Headers(body.headers);
      mediaHeaders.set("Accept-Ranges", "bytes");
      if (request.method === "HEAD") {
        return new Response(null, { status: body.status, headers: mediaHeaders });
      }
      return new Response(body.body, { status: body.status, headers: mediaHeaders });
    }
    if (contentType.startsWith("application/") && contentType !== "application/pdf") {
      headers.set("Content-Disposition", "attachment");
    }
    if (contentType === "application/pdf") headers.set("Content-Disposition", "inline");
    return createMediaResponse(request, body, headers);
  } catch (error) {
    if (error instanceof FileDownloadError) return errorResponse(error.message, error.status);
    console.error(`Public ${kind} file retrieval failed`, error);
    return errorResponse("Public file service is unavailable", 503);
  }
}
