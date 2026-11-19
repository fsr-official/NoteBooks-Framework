import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient, rpc } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

import { POST } from "../src/app/api/telemetry/page-view/route";

describe("POST /api/telemetry/page-view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ error: null });
    createSupabaseAdminClient.mockReturnValue({ rpc });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts only known public library routes and records an aggregate event", async () => {
    const response = await POST(new Request("https://example.test/api/telemetry/page-view", {
      method: "POST",
      body: JSON.stringify({ route: "/science" }),
    }));
    expect(response.status).toBe(204);
    expect(rpc).toHaveBeenCalledWith("record_website_page_view", { p_route: "/science" });
  });

  it("rejects query strings, unknown routes, and invalid JSON", async () => {
    const invalidRoute = await POST(new Request("https://example.test/api/telemetry/page-view", {
      method: "POST",
      body: JSON.stringify({ route: "/science?token=private" }),
    }));
    expect(invalidRoute.status).toBe(400);

    const invalidJson = await POST(new Request("https://example.test/api/telemetry/page-view", {
      method: "POST",
      body: "{",
    }));
    expect(invalidJson.status).toBe(400);
  });
});
