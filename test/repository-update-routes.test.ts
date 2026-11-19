import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { enqueueRepositoryUpdate, verifyQstashRequest, processRepositoryUpdate } = vi.hoisted(() => ({
  enqueueRepositoryUpdate: vi.fn(),
  verifyQstashRequest: vi.fn(),
  processRepositoryUpdate: vi.fn(),
}));

vi.mock("@/lib/qstash", () => ({ enqueueRepositoryUpdate, verifyQstashRequest }));
vi.mock("../workflow/repository-update", () => ({ processRepositoryUpdate }));

import { POST as webhook } from "../src/app/api/webhooks/repository-update/route";
import { POST as worker } from "../src/app/api/workflows/repository-update/route";

const validPayload = { repository: "owner/repo", branch: "main" };
const jsonRequest = (url: string, body: unknown, headers: HeadersInit = {}) =>
  new Request(url, { method: "POST", headers, body: JSON.stringify(body) });

describe("POST /api/webhooks/repository-update", () => {
  beforeEach(() => {
    vi.stubEnv("WEBHOOK_SECRET", "test-secret");
    enqueueRepositoryUpdate.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects unconfigured, unsigned, oversized, malformed, and invalid requests", async () => {
    vi.stubEnv("WEBHOOK_SECRET", "");
    expect((await webhook(jsonRequest("https://example.test/api/webhook", validPayload))).status).toBe(503);
    vi.stubEnv("WEBHOOK_SECRET", "test-secret");

    const unsigned = await webhook(jsonRequest("https://example.test/api/webhook", validPayload));
    expect(unsigned.status).toBe(401);

    const malformedBody = "{";
    const { createHmac } = await import("node:crypto");
    const malformed = await webhook(new Request("https://example.test/api/webhook", {
      method: "POST",
      headers: {
        "x-notebooks-signature": `sha256=${createHmac("sha256", "test-secret").update(malformedBody).digest("hex")}`,
      },
      body: malformedBody,
    }));
    expect(malformed.status).toBe(400);

    const oversized = await webhook(new Request("https://example.test/api/webhook", {
      method: "POST",
      headers: { "content-length": "5000" },
      body: "{}",
    }));
    expect(oversized.status).toBe(413);
  });

  it("rejects signed invalid payloads and queues a valid repository update", async () => {
    const { createHmac } = await import("node:crypto");
    const sign = (body: string) =>
      `sha256=${createHmac("sha256", "test-secret").update(body).digest("hex")}`;
    const invalidBody = JSON.stringify({ repository: "not-a-repository", branch: "main" });
    const invalid = await webhook(new Request("https://example.test/api/webhook", {
      method: "POST",
      headers: { "x-notebooks-signature": sign(invalidBody) },
      body: invalidBody,
    }));
    expect(invalid.status).toBe(400);

    const body = JSON.stringify(validPayload);
    enqueueRepositoryUpdate.mockResolvedValue("message-123");
    const queued = await webhook(new Request("https://example.test/api/webhook", {
      method: "POST",
      headers: { "x-notebooks-signature": sign(body) },
      body,
    }));

    expect(queued.status).toBe(202);
    await expect(queued.json()).resolves.toEqual({
      repository: "owner/repo",
      status: "queued",
      messageId: "message-123",
    });
    expect(enqueueRepositoryUpdate).toHaveBeenCalledWith(validPayload);
  });

  it("returns a service error when enqueueing fails", async () => {
    const { createHmac } = await import("node:crypto");
    const body = JSON.stringify(validPayload);
    enqueueRepositoryUpdate.mockRejectedValue(new Error("QStash unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await webhook(new Request("https://example.test/api/webhook", {
      method: "POST",
      headers: {
        "x-notebooks-signature": `sha256=${createHmac("sha256", "test-secret").update(body).digest("hex")}`,
      },
      body,
    }));

    expect(response.status).toBe(503);
  });
});

describe("POST /api/workflows/repository-update", () => {
  beforeEach(() => {
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "current-test-key");
    vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "next-test-key");
    vi.stubEnv("APP_BASE_URL", "https://example.test");
    verifyQstashRequest.mockReset();
    processRepositoryUpdate.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects unconfigured, unsigned, oversized, malformed, and invalid jobs", async () => {
    vi.stubEnv("APP_BASE_URL", "");
    expect((await worker(jsonRequest("https://example.test/api/worker", validPayload))).status).toBe(503);
    vi.stubEnv("APP_BASE_URL", "https://example.test");

    verifyQstashRequest.mockResolvedValue(false);
    const unsigned = await worker(jsonRequest("https://example.test/api/worker", validPayload));
    expect(unsigned.status).toBe(401);

    const oversized = await worker(new Request("https://example.test/api/worker", {
      method: "POST",
      headers: { "content-length": "5000" },
      body: "{}",
    }));
    expect(oversized.status).toBe(413);

    verifyQstashRequest.mockResolvedValue(true);
    const malformed = await worker(new Request("https://example.test/api/worker", {
      method: "POST",
      body: "{",
    }));
    expect(malformed.status).toBe(400);

    const invalidBody = JSON.stringify({ repository: "not-a-repository", branch: "main" });
    const invalid = await worker(new Request("https://example.test/api/worker", {
      method: "POST",
      body: invalidBody,
    }));
    expect(invalid.status).toBe(400);
  });

  it("processes a verified update job", async () => {
    verifyQstashRequest.mockResolvedValue(true);
    processRepositoryUpdate.mockResolvedValue({ status: "updated" });
    const response = await worker(jsonRequest("https://example.test/api/worker", validPayload));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "updated" });
    expect(verifyQstashRequest).toHaveBeenCalledWith(JSON.stringify(validPayload), null);
    expect(processRepositoryUpdate).toHaveBeenCalledWith(validPayload);
  });

  it("maps verification and processing failures to the documented status codes", async () => {
    verifyQstashRequest.mockRejectedValue(new Error("verification failed"));
    expect((await worker(jsonRequest("https://example.test/api/worker", validPayload))).status).toBe(401);

    verifyQstashRequest.mockResolvedValue(true);
    processRepositoryUpdate.mockRejectedValue(new Error("sync failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await worker(jsonRequest("https://example.test/api/worker", validPayload))).status).toBe(500);
  });
});
