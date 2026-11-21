import { describe, expect, it } from "vitest";
import {
  REPOSITORY_UPDATE_QUEUE_SHARD_COUNT,
  repositoryUpdateQueueName,
} from "../src/lib/repository-queue-shards";

describe("repositoryUpdateQueueName", () => {
  it("uses exactly five fixed queue shards", () => {
    expect(REPOSITORY_UPDATE_QUEUE_SHARD_COUNT).toBe(5);
  });

  it("maps a repository consistently and without case sensitivity", () => {
    expect(repositoryUpdateQueueName("fsr-science/NCERT-Science"))
      .toBe(repositoryUpdateQueueName("FSR-SCIENCE/ncert-science"));
    expect(repositoryUpdateQueueName("fsr-science/NCERT-Science"))
      .toBe(repositoryUpdateQueueName("fsr-science/NCERT-Science"));
  });

  it("maps repositories only to the configured fixed shard set", () => {
    const repositories = [
      "fsr-science/NCERT-Science",
      "fsr-commerce/NCERT-Commerce",
      "fsr-humanities/NCERT-Humanities",
      "fsr-official/NoteBooks-Documents",
      "fsr-science/CENGAGE-Physics",
      "fsr-science/CENGAGE-Maths",
      "fsr-science/CENGAGE-Chemistry",
      "fsr-science/CS-PREETI-AURORA",
      "fsr-science/MATHS-RD-SHARMA",
      "fsr-science/PHYSICS-HC-VERMA-I",
      "fsr-science/PHYSICS-HC-VERMA-II",
      "ubsr-official/notebooks",
      "fsr-science/SUPPLEMENTARY-PDF",
    ];
    const queueNames = repositories.map(repositoryUpdateQueueName);
    const allowedQueueNames = new Set(
      Array.from(
        { length: REPOSITORY_UPDATE_QUEUE_SHARD_COUNT },
        (_, shard) => `repo-update-shard-${shard}`,
      ),
    );

    expect(new Set(queueNames).size).toBeLessThanOrEqual(REPOSITORY_UPDATE_QUEUE_SHARD_COUNT);
    for (const queueName of queueNames) {
      expect(allowedQueueNames.has(queueName)).toBe(true);
    }
  });
});
