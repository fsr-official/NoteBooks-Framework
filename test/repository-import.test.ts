import { describe, expect, it, vi } from "vitest";
import {
  fetchRepositorySyncPayload,
  parseRepositoryRegistry,
  type RepositoryRegistryEntry,
} from "../src/lib/repository-import";

const REGISTRY = [
  "| name | stream | repo | branch | root | enabled | priority | pages | empty | lfs | fallback |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  "| Science | SCIENCE | owner/science | main |  | true | 1 | true | false | false |  |",
  "| Community | COMMUNITY | owner/community | main |  | true | 2 | false | false | false |  |",
  "| Issues | ISSUES | owner/issues | main |  | true | 3 | false | false | false |  |",
  "| Disabled | COMMERCE | owner/disabled | main |  | false | 4 | false | false | false |  |",
].join("\n");

const commitSha = "a".repeat(40);
const blobSha = "b".repeat(40);

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status });
}

describe("repository registry import", () => {
  it("parses enabled in-scope repositories and maps Developers to developer", () => {
    const entries = parseRepositoryRegistry([
      REGISTRY,
      "| Documents | DEVELOPERS | fsr/Docs | main |  | true | 5 | false | false | false | github-tree |",
    ].join("\n"));

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => `${entry.repo_owner}/${entry.repo_name}`)).toEqual([
      "owner/science",
      "fsr/Docs",
    ]);
    expect(entries[1]).toMatchObject({
      class_or_stream: "developer",
      fallback: "github-tree",
    });
  });

  it("maps both Class 9 and Class 10 repositories into Lower Secondary", () => {
    const entries = parseRepositoryRegistry([
      REGISTRY,
      "| Class 9 | CLASSNINE | fsr/class-nine | main |  | true | 5 | false | false | false |  |",
      "| Class 10 | CLASSTEN | fsr/class-ten | main |  | true | 6 | false | false | false |  |",
    ].join("\n"));

    expect(entries.slice(1).map((entry) => entry.class_or_stream)).toEqual([
      "lowersecondary",
      "lowersecondary",
    ]);
  });

  it("rejects duplicate repository rows", () => {
    expect(() => parseRepositoryRegistry([
      REGISTRY,
      "| Duplicate | SCIENCE | OWNER/SCIENCE | main |  | true | 5 | false | false | false |  |",
    ].join("\n"))).toThrow("Duplicate repository registry entry");
  });

  it("fetches a manifest at the resolved commit and normalizes nested paths and SHAs", async () => {
    const entry = parseRepositoryRegistry(REGISTRY)[0];
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ sha: commitSha }))
      .mockResolvedValueOnce(response({
        type: "folder",
        name: "science",
        children: [{
          type: "folder",
          name: "chapter",
          children: [{ type: "file", name: "lesson.md", path: "chapter/lesson.md", sha: blobSha }],
        }],
      }));

    const payload = await fetchRepositorySyncPayload(entry, { fetcher });

    expect(payload).toMatchObject({
      files: [{ name: "lesson.md", path: "chapter/lesson.md", sha: blobSha }],
      last_commit_sha: commitSha,
    });
    expect(fetcher.mock.calls[1][0]).toContain(commitSha);
  });

  it("records an explicitly empty repository without fetching a manifest", async () => {
    const entry: RepositoryRegistryEntry = {
      ...parseRepositoryRegistry(REGISTRY)[0],
      empty: true,
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ sha: commitSha }));

    const payload = await fetchRepositorySyncPayload(entry, { fetcher });

    expect(payload.files).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fills missing manifest SHAs from the GitHub tree at the same commit", async () => {
    const entry = parseRepositoryRegistry(REGISTRY)[0];
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ sha: commitSha }))
      .mockResolvedValueOnce(response({
        type: "folder",
        children: [{ type: "file", name: "lesson.md", path: "lesson.md" }],
      }))
      .mockResolvedValueOnce(response({
        truncated: false,
        tree: [{ path: "lesson.md", sha: blobSha, type: "blob" }],
      }));

    const payload = await fetchRepositorySyncPayload(entry, { fetcher });

    expect(payload.files).toEqual([{ name: "lesson.md", path: "lesson.md", sha: blobSha }]);
  });

  it("uses the recursive GitHub tree fallback when configured", async () => {
    const entry: RepositoryRegistryEntry = {
      ...parseRepositoryRegistry(REGISTRY)[0],
      fallback: "github-tree",
      pages: false,
    };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ sha: commitSha }))
      .mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response({
        truncated: false,
        tree: [{ path: "docs/readme.md", sha: blobSha, type: "blob" }],
      }));

    const payload = await fetchRepositorySyncPayload(entry, { fetcher });

    expect(payload.files).toEqual([{ name: "readme.md", path: "docs/readme.md", sha: blobSha }]);
  });
});
