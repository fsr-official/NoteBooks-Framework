import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedAccount } = vi.hoisted(() => ({ getAuthenticatedAccount: vi.fn() }));
vi.mock("@/lib/authenticated-account", () => ({ getAuthenticatedAccount }));

import { requireAdmin } from "../src/lib/admin-access";

describe("admin route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires a signed-in account", async () => {
    getAuthenticatedAccount.mockResolvedValue(null);
    const result = await requireAdmin(new Request("https://example.test/api/admin"));
    expect(result.account).toBeNull();
    expect(result.response?.status).toBe(401);
  });

  it("rejects ordinary accounts and allows only the administrator role", async () => {
    getAuthenticatedAccount.mockResolvedValue({
      accountId: "member-01",
      role: "user",
      user: { id: "user-id" },
    });
    expect((await requireAdmin(new Request("https://example.test/api/admin"))).response?.status).toBe(403);

    const administrator = {
      accountId: "admin-01",
      role: "admin" as const,
      user: { id: "admin-id" },
    };
    getAuthenticatedAccount.mockResolvedValue(administrator);
    await expect(requireAdmin(new Request("https://example.test/api/admin"))).resolves.toEqual({
      account: administrator,
      response: null,
    });
  });

  it("returns an explicit service error when account verification fails", async () => {
    getAuthenticatedAccount.mockRejectedValue(new Error("database unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await requireAdmin(new Request("https://example.test/api/admin"))).response?.status).toBe(503);
  });
});
