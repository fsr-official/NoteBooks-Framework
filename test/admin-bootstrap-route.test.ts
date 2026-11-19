import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedAccount, recordAdminAuditEvent, createSupabaseAdminClient, from } = vi.hoisted(() => ({
  getAuthenticatedAccount: vi.fn(),
  recordAdminAuditEvent: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/authenticated-account", () => ({ getAuthenticatedAccount }));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAuditEvent }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

import { POST } from "../src/app/api/admin/bootstrap/route";

const member = {
  accountId: "owner-01",
  role: "user" as const,
  user: { id: "auth-user-id" },
};

function request(token: string) {
  return new Request("https://example.test/api/admin/bootstrap", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

function configureBootstrap(existingAdmin: unknown, promoted: unknown) {
  const lookup = {
    select: vi.fn(() => lookup),
    eq: vi.fn(() => lookup),
    maybeSingle: vi.fn(async () => ({ data: existingAdmin, error: null })),
  };
  const update = {
    update: vi.fn(() => update),
    eq: vi.fn(() => update),
    select: vi.fn(() => update),
    maybeSingle: vi.fn(async () => ({ data: promoted, error: null })),
  };
  from.mockReturnValueOnce(lookup).mockReturnValueOnce(update);
  createSupabaseAdminClient.mockReturnValue({ from });
  return { lookup, update };
}

describe("POST /api/admin/bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ADMIN_BOOTSTRAP_TOKEN", "a-strong-one-time-bootstrap-token");
    getAuthenticatedAccount.mockResolvedValue(member);
    recordAdminAuditEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects unauthenticated users and incorrect bootstrap tokens", async () => {
    getAuthenticatedAccount.mockResolvedValue(null);
    expect((await POST(request("a-strong-one-time-bootstrap-token"))).status).toBe(401);

    getAuthenticatedAccount.mockResolvedValue(member);
    expect((await POST(request("wrong-token"))).status).toBe(403);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("allows only the first administrator claim and records the promotion", async () => {
    configureBootstrap(null, { account_id: member.accountId });
    const response = await POST(request("a-strong-one-time-bootstrap-token"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accountId: member.accountId,
      status: "admin-created",
    });
    expect(recordAdminAuditEvent).toHaveBeenCalledWith({
      accountId: member.accountId,
      action: "admin.bootstrap",
      resource: member.accountId,
    });
  });

  it("refuses if an administrator already exists", async () => {
    configureBootstrap({ account_id: "already-admin" }, null);
    expect((await POST(request("a-strong-one-time-bootstrap-token"))).status).toBe(409);
    expect(recordAdminAuditEvent).not.toHaveBeenCalled();
  });
});
