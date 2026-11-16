import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthenticatedAccount,
  requireAdmin,
  createSupabaseAdminClient,
  getRedisClient,
  from,
  rpc,
  ping,
} = vi.hoisted(() => ({
  getAuthenticatedAccount: vi.fn(),
  requireAdmin: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getRedisClient: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  ping: vi.fn(),
}));

vi.mock("@/lib/authenticated-account", () => ({ getAuthenticatedAccount }));
vi.mock("@/lib/admin-access", () => ({ requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));
vi.mock("@/lib/public-index-cache", () => ({ getRedisClient }));

import { GET as status } from "../src/app/api/admin/status/route";
import { GET as overview } from "../src/app/api/admin/overview/route";
import { GET as repositories } from "../src/app/api/admin/repositories/route";
import { POST as rebuildIndexes } from "../src/app/api/admin/indexes/rebuild/route";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import { rebuildAdminRepositoryIndexes } from "@/lib/admin-repository-index";

vi.mock("@/lib/admin-audit", () => ({ recordAdminAuditEvent: vi.fn() }));
vi.mock("@/lib/admin-repository-index", () => ({ rebuildAdminRepositoryIndexes: vi.fn() }));

function configureAccountLookup(result: { data: unknown; error: null }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    order: vi.fn(() => query),
    then: (resolve: (value: { data: unknown; error: null }) => unknown) => Promise.resolve(result).then(resolve),
  };
  from.mockReturnValue(query);
  return query;
}

describe("admin dashboard read and index routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedAccount.mockResolvedValue({
      accountId: "admin-01",
      role: "admin",
      user: { id: "auth-admin" },
    });
    requireAdmin.mockResolvedValue({
      account: { accountId: "admin-01", role: "admin", user: { id: "auth-admin" } },
      response: null,
    });
    createSupabaseAdminClient.mockReturnValue({ from, rpc });
    rpc.mockResolvedValue({
      data: {
        summary: { totalRepositories: 1, totalFiles: 12 },
        repositories: [],
        accounts: [],
        apiMetrics24h: [],
        pageTraffic24h: [],
        recentEvents: [],
      },
      error: null,
    });
    ping.mockResolvedValue("PONG");
    getRedisClient.mockReturnValue({ ping });
    vi.mocked(recordAdminAuditEvent).mockResolvedValue(undefined);
    vi.mocked(rebuildAdminRepositoryIndexes).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reports single-admin bootstrap state without exposing its token", async () => {
    configureAccountLookup({ data: null, error: null });
    const response = await status(new Request("https://example.test/api/admin/status"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      isAdmin: true,
      hasAdministrator: false,
      bootstrapAvailable: false,
    });
  });

  it("returns catalog, API, page, and dependency health for an administrator", async () => {
    vi.stubEnv("GITHUB_TOKEN", "configured-test-token");
    vi.stubEnv("QSTASH_TOKEN", "qstash-token");
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "current-key");
    vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "next-key");
    vi.stubEnv("APP_BASE_URL", "https://example.test");

    const response = await overview(new Request("https://example.test/api/admin/overview"));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_admin_dashboard_snapshot");
    expect(ping).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({
      summary: { totalRepositories: 1, totalFiles: 12 },
      services: { database: "healthy", redis: "healthy", github: "configured", qstash: "configured" },
    });
  });

  it("lists repository rows and runs an audited full index rebuild", async () => {
    const query = configureAccountLookup({ data: [{ id: "repo-id" }], error: null });
    const listed = await repositories(new Request("https://example.test/api/admin/repositories"));
    expect(listed.status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("record_type", "repository");
    await expect(listed.json()).resolves.toEqual({ repositories: [{ id: "repo-id" }] });

    const rebuilt = await rebuildIndexes(new Request("https://example.test/api/admin/indexes/rebuild", {
      method: "POST",
      headers: { authorization: "Bearer token" },
      body: "{}",
    }));
    expect(rebuilt.status).toBe(200);
    expect(rebuildAdminRepositoryIndexes).toHaveBeenCalledOnce();
    expect(recordAdminAuditEvent).toHaveBeenCalledWith({
      accountId: "admin-01",
      action: "indexes.rebuild",
      resource: "all-public-indexes",
    });
  });
});
