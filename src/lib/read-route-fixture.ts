import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReadRouteDataProvider, ReadRouteIdentity } from "@/lib/read-route-data";

export const C2_FIXTURE_ROUTE: ReadRouteIdentity = Object.freeze({
  owner: "notebooks-c2-fixture",
  repository: "read-c2-fixture",
  path: "test/fixtures/read-c2/source.mdx",
  branch: "main",
});

const FIXTURE_SOURCE_PATH = join(process.cwd(), "test/fixtures/read-c2/source.mdx");

function isExactFixtureIdentity(identity: ReadRouteIdentity): boolean {
  return identity.owner === C2_FIXTURE_ROUTE.owner
    && identity.repository === C2_FIXTURE_ROUTE.repository
    && identity.path === C2_FIXTURE_ROUTE.path
    && identity.branch === C2_FIXTURE_ROUTE.branch;
}

function isExactFixtureRequest(request: Request): boolean {
  const url = new URL(request.url);
  return ["owner", "repo", "path"].every((key) => url.searchParams.getAll(key).length === 1)
    && url.searchParams.get("owner") === C2_FIXTURE_ROUTE.owner
    && url.searchParams.get("repo") === C2_FIXTURE_ROUTE.repository
    && url.searchParams.get("path") === C2_FIXTURE_ROUTE.path;
}

function notFoundResponse(): Response {
  return Response.json(
    { error: "Fixture route not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

export const c2FixtureReadRouteDataProvider: ReadRouteDataProvider = {
  kind: "fixture",
  async isMdxRenderingEnabled(identity) {
    return isExactFixtureIdentity(identity);
  },
  async servePublicContent(request, identity) {
    if (!isExactFixtureIdentity(identity) || !isExactFixtureRequest(request)) {
      return notFoundResponse();
    }

    const contents = await readFile(FIXTURE_SOURCE_PATH);
    const source = new TextDecoder("utf-8", { fatal: true }).decode(contents);
    // Match Git's blob SHA-1: "blob <byte-length>\0" followed by the raw file bytes.
    const fileSha = createHash("sha1")
      .update(Buffer.from(`blob ${contents.byteLength}\0`, "utf8"))
      .update(contents)
      .digest("hex");
    return new Response(source, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/markdown; charset=utf-8",
        ETag: `"${fileSha}"`,
        "X-Content-Type-Options": "nosniff",
        "X-File-SHA": fileSha,
        "X-Repository": `${C2_FIXTURE_ROUTE.owner}/${C2_FIXTURE_ROUTE.repository}`,
        "X-Repository-Branch": C2_FIXTURE_ROUTE.branch,
      },
    });
  },
};
