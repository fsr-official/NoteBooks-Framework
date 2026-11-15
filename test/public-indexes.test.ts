import { describe, expect, it } from "vitest";
import {
  buildRepositoryIndex,
  buildSectionIndex,
  rebuildPublicIndexes,
  getPublicIndexName,
  publicIndexCacheKey,
  type PublicFileRecord,
  type PublicRepositoryRecord,
} from "../src/lib/public-indexes";
import { encodePublicIndexValue } from "../src/lib/upstash-public-index-store";

const repository: PublicRepositoryRecord = {
  branch: "main",
  class_or_stream: "science",
  empty: false,
  enabled: true,
  fallback: null,
  id: "repo-id",
  lfs: false,
  pages: true,
  priority: 1,
  registry_name: "Science Notes",
  repo_name: "notes",
  repo_owner: "owner",
  root: "",
};

const files: PublicFileRecord[] = [{
  file_name: "lesson.pdf",
  file_path: "physics/lesson.pdf",
  file_sha: "a".repeat(40),
  repo_id: "repo-id",
}];

describe("public indexes", () => {
  it("builds a directly keyed file lookup and corresponding JSONL records", () => {
    const formats = buildSectionIndex([repository], files);
    const document = JSON.parse(formats.json) as {
      schemaVersion: number;
      entries: Record<string, { filePath: string; fileSha: string }>;
    };

    expect(document.schemaVersion).toBe(1);
    expect(document.entries["owner/notes/physics/lesson.pdf"]).toMatchObject({
      filePath: "physics/lesson.pdf",
      fileSha: "a".repeat(40),
    });
    expect(formats.jsonl.split("\n").filter(Boolean)).toHaveLength(1);
    expect(JSON.parse(formats.jsonl.trim())).toHaveProperty("repositoryId", "repo-id");
  });

  it("builds the repository lookup with stable GitHub identifiers", () => {
    const formats = buildRepositoryIndex([repository]);
    const document = JSON.parse(formats.json) as {
      entries: Record<string, { branch: string; classOrStream: string }>;
    };

    expect(document.entries["owner/notes"]).toMatchObject({
      branch: "main",
      classOrStream: "science",
    });
    expect(JSON.parse(formats.jsonl.trim())).toHaveProperty("name", "Science Notes");
  });

  it("restricts public assets to the six known indexes and both supported formats", () => {
    expect(getPublicIndexName("science-tree.json")).toEqual({
      name: "science-tree",
      format: "json",
    });
    expect(getPublicIndexName("lowersecondary-tree.jsonl")).toEqual({
      name: "lowersecondary-tree",
      format: "jsonl",
    });
    expect(getPublicIndexName("github_repositories.jsonl")).toEqual({
      name: "github_repositories",
      format: "jsonl",
    });
    expect(getPublicIndexName("accounts.json")).toBeNull();
    expect(getPublicIndexName("classnine-tree.json")).toBeNull();
    expect(getPublicIndexName("classten-tree.json")).toBeNull();
    expect(publicIndexCacheKey("science-tree", "json")).toBe("notebooks:public-index:v1:science-tree:json");
  });

  it("rebuilds only requested sections unless a full repository index rebuild is requested", async () => {
    const repositoryQueries: (string | undefined)[] = [];
    const fileQueries: string[][] = [];
    const writes: string[] = [];
    const database = {
      async listRepositories(group?: PublicRepositoryRecord["class_or_stream"]) {
        repositoryQueries.push(group);
        return group ? [repository] : [repository];
      },
      async listFiles(repositoryIds: string[]) {
        fileQueries.push(repositoryIds);
        return files;
      },
    };
    const store = {
      async get() {
        return null;
      },
      async set(key: string) {
        writes.push(key);
      },
    };

    await expect(rebuildPublicIndexes(database, store, {
      groups: ["science"],
    })).resolves.toEqual(["science-tree"]);
    expect(repositoryQueries).toEqual(["science"]);
    expect(fileQueries).toEqual([["repo-id"]]);
    expect(writes).toEqual([
      "notebooks:public-index:v1:science-tree:json",
      "notebooks:public-index:v1:science-tree:jsonl",
    ]);

    repositoryQueries.length = 0;
    await expect(rebuildPublicIndexes(database, store, {
      groups: [],
      includeRepositories: true,
    })).resolves.toEqual(["github_repositories"]);
    expect(repositoryQueries).toEqual([undefined]);
  });

  it("uses one database snapshot to build every index during a full rebuild", async () => {
    const repositoryQueries: (string | undefined)[] = [];
    const fileQueries: string[][] = [];
    const writes: string[] = [];
    const database = {
      async listRepositories(group?: PublicRepositoryRecord["class_or_stream"]) {
        repositoryQueries.push(group);
        return [repository];
      },
      async listFiles(repositoryIds: string[]) {
        fileQueries.push(repositoryIds);
        return files;
      },
    };
    const store = {
      async get() {
        return null;
      },
      async set(key: string) {
        writes.push(key);
      },
      async setMany(entries: Array<{ key: string }>) {
        writes.push(...entries.map(({ key }) => key));
      },
    };

    await expect(rebuildPublicIndexes(database, store, {
      includeRepositories: true,
    })).resolves.toHaveLength(6);
    expect(repositoryQueries).toEqual([undefined]);
    expect(fileQueries).toEqual([["repo-id"]]);
    expect(writes).toHaveLength(12);
  });

  it("encodes generated documents as JSON strings for Upstash auto-deserialization", () => {
    const document = '{"schemaVersion":1,"entries":{}}';
    const encoded = encodePublicIndexValue(document);

    expect(JSON.parse(encoded)).toBe(document);
  });
});
