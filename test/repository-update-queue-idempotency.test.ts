import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { enqueueJSON, queue } = vi.hoisted(() => ({
  enqueueJSON: vi.fn(),
  queue: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@upstash/qstash", () => ({
  Client: vi.fn(() => ({ queue })),
  Receiver: vi.fn(),
}));

import { enqueueRepositoryUpdate } from "../src/lib/qstash";

const baseJob = {
  repository: "owner/repo",
  branch: "main",
  identity: { source: "push" as const, runId: "123456789", runAttempt: 1 },
};

describe("repository update queue deduplication identity", () => {
  beforeEach(() => {
    vi.stubEnv("APP_BASE_URL", "https://example.test");
    vi.stubEnv("QSTASH_TOKEN", "test-token");
    enqueueJSON.mockReset().mockResolvedValue({ messageId: "qstash-message" });
    queue.mockReset().mockReturnValue({ enqueueJSON });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reuses the identity for the same workflow occurrence and scopes changes in every component", async () => {
    const jobs = [
      baseJob,
      { ...baseJob, identity: { ...baseJob.identity } },
      { ...baseJob, identity: { ...baseJob.identity, runId: "987654321" } },
      { ...baseJob, identity: { ...baseJob.identity, runAttempt: 2 } },
      { ...baseJob, repository: "owner/other" },
      { ...baseJob, branch: "release" },
      { ...baseJob, identity: { ...baseJob.identity, source: "reconciliation" as const } },
    ];

    await Promise.all(jobs.map((job) => enqueueRepositoryUpdate(job)));

    const deduplicationIds = enqueueJSON.mock.calls.map(([message]) => message.deduplicationId);
    expect(deduplicationIds[0]).toBe(deduplicationIds[1]);
    for (const index of [2, 3, 4, 5, 6]) {
      expect(deduplicationIds[index]).not.toBe(deduplicationIds[0]);
    }
    expect(new Set(deduplicationIds).size).toBe(6);
  });

  it("rejects missing and malformed identities before publishing", async () => {
    const invalidJobs = [
      { repository: baseJob.repository, branch: baseJob.branch },
      { ...baseJob, identity: { source: "push", runId: "abc", runAttempt: 1 } },
      { ...baseJob, identity: { source: "push", runId: "123", runAttempt: 0 } },
      { ...baseJob, identity: { source: "admin", requestId: "not-a-uuid" } },
    ];

    for (const job of invalidJobs) {
      await expect(enqueueRepositoryUpdate(job as never)).rejects.toThrow(
        "Invalid repository update job identity or payload",
      );
    }
    expect(enqueueJSON).not.toHaveBeenCalled();
  });
});
