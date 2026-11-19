import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, enqueueRepositoryUpdate, from } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  enqueueRepositoryUpdate: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));
vi.mock("@/lib/qstash", () => ({ enqueueRepositoryUpdate }));

import { POST } from "../src/app/api/cron/repository-reconciliation/route";

const secret = "0123456789abcdef0123456789abcdef";
const rows = [
  { branch: "main", repo_name: "one", repo_owner: "owner" },
  { branch: "main", repo_name: "two", repo_owner: "owner" },
];

function configureRepositories(data: unknown, error: unknown = null) {
  const result = { data, error };
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn(() => query),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  from.mockReturnValue(query);
  createSupabaseAdminClient.mockReturnValue({ from });
  return query;
}

function request(token = secret) {
  return new Request("https://example.test/api/cron/repository-reconciliation", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("POST /api/cron/repository-reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("REPOSITORY_RECONCILIATION_SECRET", secret);
    enqueueRepositoryUpdate.mockResolvedValue("qstash-message");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("requires a configured strong secret and rejects invalid credentials before database access", async () => {
    vi.stubEnv("REPOSITORY_RECONCILIATION_SECRET", "");
    expect((await POST(request())).status).toBe(503);

    vi.stubEnv("REPOSITORY_RECONCILIATION_SECRET", "short");
    expect((await POST(request("short"))).status).toBe(503);

    vi.stubEnv("REPOSITORY_RECONCILIATION_SECRET", secret);
    expect((await POST(request("wrong"))).status).toBe(401);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("queues all enabled, non-archived repositories through the existing worker", async () => {
    const query = configureRepositories(rows);
    const response = await POST(request());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      checked: 2,
      queued: 2,
      failed: [],
      status: "queued",
    });
    expect(query.eq).toHaveBeenCalledWith("record_type", "repository");
    expect(query.eq).toHaveBeenCalledWith("enabled", true);
    expect(query.is).toHaveBeenCalledWith("archived_at", null);
    expect(enqueueRepositoryUpdate).toHaveBeenCalledWith({
      repository: "owner/one",
      branch: "main",
    });
    expect(enqueueRepositoryUpdate).toHaveBeenCalledWith({
      repository: "owner/two",
      branch: "main",
    });
  });

  it("returns success when there are no enabled repositories", async () => {
    configureRepositories([]);
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      checked: 0,
      queued: 0,
      failed: [],
      status: "no-enabled-repositories",
    });
    expect(enqueueRepositoryUpdate).not.toHaveBeenCalled();
  });

  it("reports partial queue failures as a service failure", async () => {
    configureRepositories(rows);
    enqueueRepositoryUpdate
      .mockRejectedValueOnce(new Error("QStash unavailable"))
      .mockResolvedValueOnce("qstash-message");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      checked: 2,
      queued: 1,
      failed: ["owner/one"],
      status: "partial",
    });
  });

  it("surfaces catalog query failures", async () => {
    configureRepositories(null, { message: "database unavailable" });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await POST(request())).status).toBe(503);
    expect(enqueueRepositoryUpdate).not.toHaveBeenCalled();
  });
});
