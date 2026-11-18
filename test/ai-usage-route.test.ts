import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedAccount, rpc } = vi.hoisted(() => ({
  getAuthenticatedAccount: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../src/lib/authenticated-account", () => ({ getAuthenticatedAccount }));
vi.mock("../src/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc }),
}));

import { GET } from "../src/app/api/account/ai-usage/route";

describe("GET /api/account/ai-usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedAccount.mockResolvedValue({
      accountId: "reader_user",
      role: "user",
      user: { id: "auth-user-id" },
    });
    rpc.mockResolvedValue({
      data: [{
        month_requests: 3,
        month_prompt_tokens: 1200,
        month_completion_tokens: 600,
        all_time_requests: 9,
        all_time_prompt_tokens: 3800,
        all_time_completion_tokens: 2000,
      }],
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns request and token totals for the authenticated account", async () => {
    const response = await GET(new Request("https://example.test/api/account/ai-usage", {
      headers: { authorization: "Bearer valid-token" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      month_requests: 3,
      month_prompt_tokens: 1200,
      month_completion_tokens: 600,
      all_time_requests: 9,
      all_time_prompt_tokens: 3800,
      all_time_completion_tokens: 2000,
    });
    expect(rpc).toHaveBeenCalledWith("get_ai_usage_summary", { p_account_id: "reader_user" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects unauthenticated callers and surfaces summary failures", async () => {
    getAuthenticatedAccount.mockResolvedValueOnce(null);
    expect((await GET(new Request("https://example.test/api/account/ai-usage"))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockResolvedValueOnce({ data: null, error: new Error("Database unavailable") });
    expect((await GET(new Request("https://example.test/api/account/ai-usage", {
      headers: { authorization: "Bearer valid-token" },
    }))).status).toBe(503);
  });
});
