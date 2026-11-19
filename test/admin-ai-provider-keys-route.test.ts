import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, createSupabaseAdminClient, rpc, recordAdminAuditEvent } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  rpc: vi.fn(),
  recordAdminAuditEvent: vi.fn(),
}));

vi.mock("@/lib/admin-access", () => ({ requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAuditEvent }));

import { GET } from "../src/app/api/admin/ai-provider-keys/route";
import { PATCH } from "../src/app/api/admin/ai-provider-keys/[keySlot]/route";

const snapshot = [
  {
    keySlot: "main",
    enabled: true,
    cooldownUntil: null,
    lastRateLimitedAt: null,
    requests24h: 12,
    promptTokens24h: 100,
    completionTokens24h: 50,
    rateLimited24h: 1,
    requests30d: 100,
    promptTokens30d: 900,
    completionTokens30d: 450,
  },
  ...["science", "commerce", "humanities", "lower-secondary"].map((keySlot) => ({
    keySlot,
    enabled: true,
    cooldownUntil: null,
    lastRateLimitedAt: null,
    requests24h: 0,
    promptTokens24h: 0,
    completionTokens24h: 0,
    rateLimited24h: 0,
    requests30d: 0,
    promptTokens30d: 0,
    completionTokens30d: 0,
  })),
];

describe("admin AI provider key routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({
      account: { accountId: "admin-01", role: "admin" },
      response: null,
    });
    createSupabaseAdminClient.mockReturnValue({ rpc });
    rpc.mockResolvedValue({ data: snapshot, error: null });
    recordAdminAuditEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns aggregate usage and configuration presence without exposing provider secrets", async () => {
    vi.stubEnv("GROQ_API_KEY_MAIN", "do-not-return-this-secret");
    const response = await GET(new Request("https://example.test/api/admin/ai-provider-keys"));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_ai_provider_key_dashboard");
    const body = await response.text();
    expect(body).not.toContain("do-not-return-this-secret");
    const responseBody = JSON.parse(body) as { keys: Array<Record<string, unknown>> };
    expect(responseBody.keys).toHaveLength(5);
    expect(responseBody.keys[0]).toMatchObject({
      keySlot: "main",
      configured: true,
      enabled: true,
      requests24h: 12,
      promptTokens24h: 100,
      rateLimited24h: 1,
    });
    expect(responseBody.keys[1]).toMatchObject({
      keySlot: "science",
      configured: false,
    });
  });

  it("updates a key slot through the service RPC and records the admin action", async () => {
    const response = await PATCH(
      new Request("https://example.test/api/admin/ai-provider-keys/main", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      }),
      { params: Promise.resolve({ keySlot: "main" }) },
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_ai_provider_key_enabled", {
      p_key_slot: "main",
      p_enabled: false,
      p_updated_by: "admin-01",
    });
    expect(recordAdminAuditEvent).toHaveBeenCalledWith({
      accountId: "admin-01",
      action: "ai.provider-key.disable",
      resource: "groq:main",
      details: { enabled: false, keySlot: "main" },
    });
  });

  it("rejects unknown slots and malformed state changes", async () => {
    const unknownSlot = await PATCH(
      new Request("https://example.test/api/admin/ai-provider-keys/unknown", {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      }),
      { params: Promise.resolve({ keySlot: "unknown" }) },
    );
    const invalidBody = await PATCH(
      new Request("https://example.test/api/admin/ai-provider-keys/main", {
        method: "PATCH",
        body: JSON.stringify({ enabled: "false" }),
      }),
      { params: Promise.resolve({ keySlot: "main" }) },
    );

    expect(unknownSlot.status).toBe(404);
    expect(invalidBody.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
