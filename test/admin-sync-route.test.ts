import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, recordAdminAuditEvent, enqueueRepositoryUpdate, createSupabaseAdminClient, from } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  recordAdminAuditEvent: vi.fn(),
  enqueueRepositoryUpdate: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/admin-access", () => ({ requireAdmin }));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAuditEvent }));
vi.mock("@/lib/qstash", () => ({ enqueueRepositoryUpdate }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

import { POST } from "../src/app/api/admin/repositories/sync/route";

function configureRepositories(rows: unknown[]) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn(() => query),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  from.mockReturnValue(query);
  createSupabaseAdminClient.mockReturnValue({ from });
}

describe("POST /api/admin/repositories/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({
      account: { accountId: "admin-01", role: "admin" },
      response: null,
    });
    recordAdminAuditEvent.mockResolvedValue(undefined);
    enqueueRepositoryUpdate.mockResolvedValue("qstash-message");
    configureRepositories([
      { id: "repo-id-1", branch: "main", repo_name: "one", repo_owner: "owner" },
      { id: "repo-id-2", branch: "main", repo_name: "two", repo_owner: "owner" },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queues all enabled repositories and records the administrative action", async () => {
    const response = await POST(new Request("https://example.test/api/admin/repositories/sync", {
      method: "POST",
      headers: { authorization: "Bearer token" },
      body: "{}",
    }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      queued: 2,
      failed: [],
      status: "queued",
    });
    expect(enqueueRepositoryUpdate).toHaveBeenCalledTimes(2);
    expect(recordAdminAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "admin-01",
      action: "repository.sync.request",
      resource: "all-enabled-repositories",
      details: { queued: 2, failed: 0 },
    }));
  });

  it("rejects malformed repository selections and reports queue failures", async () => {
    const invalid = await POST(new Request("https://example.test/api/admin/repositories/sync", {
      method: "POST",
      headers: { authorization: "Bearer token" },
      body: JSON.stringify({ repoId: "invalid" }),
    }));
    expect(invalid.status).toBe(400);

    enqueueRepositoryUpdate.mockRejectedValue(new Error("queue down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await POST(new Request("https://example.test/api/admin/repositories/sync", {
      method: "POST",
      headers: { authorization: "Bearer token" },
      body: "{}",
    }));
    expect(failed.status).toBe(503);
    await expect(failed.json()).resolves.toMatchObject({
      queued: 0,
      failed: ["owner/one", "owner/two"],
      status: "failed",
    });
  });
});
