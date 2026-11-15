import { config } from "dotenv";
import { Redis } from "@upstash/redis";
import {
  TREE_GROUPS,
  type PublicIndexFormat,
  type PublicIndexName,
} from "../src/lib/public-indexes";

config({ path: ".env.local", quiet: true });

interface ExpectedIndex {
  name: PublicIndexName;
  format: PublicIndexFormat;
}

function expectedIndexes(): ExpectedIndex[] {
  const names: PublicIndexName[] = [
    ...TREE_GROUPS.map((group) => `${group}-tree` as const),
    "github_repositories",
  ];
  return names.flatMap((name) => [
    { name, format: "json" },
    { name, format: "jsonl" },
  ]);
}

function recordCount(name: PublicIndexName, format: PublicIndexFormat, document: string): number {
  if (format === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(document);
    } catch {
      throw new Error(`${name}.json is not valid JSON`);
    }
    if (
      typeof parsed !== "object"
      || parsed === null
      || !("schemaVersion" in parsed)
      || parsed.schemaVersion !== 1
      || !("entries" in parsed)
      || typeof parsed.entries !== "object"
      || parsed.entries === null
      || Array.isArray(parsed.entries)
    ) {
      throw new Error(`${name}.json has an invalid public-index shape`);
    }
    return Object.keys(parsed.entries).length;
  }

  const lines = document.split("\n").filter((line) => line.length > 0);
  for (const [index, line] of lines.entries()) {
    try {
      JSON.parse(line);
    } catch {
      throw new Error(`${name}.jsonl contains invalid JSON on line ${index + 1}`);
    }
  }
  return lines.length;
}

async function main(): Promise<void> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("KV_REST_API_URL and KV_REST_API_TOKEN must be configured");
  }

  const redis = new Redis({ url, token });
  const indexes = expectedIndexes();
  const pipeline = redis.pipeline();
  for (const { name, format } of indexes) {
    pipeline.get(`notebooks:public-index:v1:${name}:${format}`);
  }
  const values = await pipeline.exec();

  const counts = new Map<PublicIndexName, Map<PublicIndexFormat, number>>();
  for (const [index, value] of values.entries()) {
    const descriptor = indexes[index];
    if (typeof value !== "string") {
      throw new Error(`Missing or invalid Redis value: ${descriptor.name}.${descriptor.format}`);
    }
    const count = recordCount(descriptor.name, descriptor.format, value);
    const formats = counts.get(descriptor.name) ?? new Map<PublicIndexFormat, number>();
    formats.set(descriptor.format, count);
    counts.set(descriptor.name, formats);
    console.log(
      `${descriptor.name}.${descriptor.format}: ${count} entries, ${Buffer.byteLength(value)} bytes`,
    );
  }

  for (const [name, formats] of counts) {
    if (formats.get("json") !== formats.get("jsonl")) {
      throw new Error(`${name} JSON and JSONL entry counts do not match`);
    }
  }

  console.log(`Redis public indexes healthy: ${indexes.length} keys across ${counts.size} indexes.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Redis public-index verification failed");
  process.exitCode = 1;
});
