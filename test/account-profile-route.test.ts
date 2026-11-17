import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedAccount, createSupabaseAdminClient, from, update, eq, select, maybeSingle } = vi.hoisted(() => ({
  getAuthenticatedAccount: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/authenticated-account", () => ({ getAuthenticatedAccount }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

import { POST } from "../src/app/api/account/profile/route";

function makeRequest(body: unknown) {
  return new Request("https://example.test/api/account/profile", {
    method: "POST",
    headers: { authorization: "Bearer token", "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/account/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedAccount.mockResolvedValue({
      accountId: "user-0123456789ab",
      role: "user",
      user: { id: "auth-user-id" },
    });
    update.mockReturnValue({ eq });
    eq.mockImplementation(() => ({ eq, select }));
    select.mockReturnValue({ maybeSingle });
    maybeSingle.mockResolvedValue({ data: { account_id: "alex_studies", user_name: "Alex" }, error: null });
    from.mockReturnValue({ update });
    createSupabaseAdminClient.mockReturnValue({ from });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates the signed-in user's account ID", async () => {
    const response = await POST(makeRequest({ accountId: "Alex_Studies" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accountId: "alex_studies", userName: "Alex" });
    expect(from).toHaveBeenCalledWith("accounts");
    expect(update).toHaveBeenCalledWith({ account_id: "alex_studies" });
    expect(eq).toHaveBeenCalledWith("auth_user_id", "auth-user-id");
    expect(eq).toHaveBeenCalledWith("account_id", "user-0123456789ab");
  });

  it("rejects unauthenticated requests and invalid usernames", async () => {
    getAuthenticatedAccount.mockResolvedValueOnce(null);
    expect((await POST(makeRequest({ accountId: "alex" }))).status).toBe(401);
    expect((await POST(makeRequest({ accountId: "bad username" }))).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("reports when a username is already taken", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { code: "23505" } });

    const response = await POST(makeRequest({ accountId: "alex_studies" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "That User ID is already taken" });
  });

  it("does not allow changing a User ID after setup", async () => {
    getAuthenticatedAccount.mockResolvedValue({
      accountId: "alex_studies",
      role: "user",
      user: { id: "auth-user-id" },
    });

    const response = await POST(makeRequest({ accountId: "alex_new" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Your User ID is permanent and cannot be changed after account setup",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("allows signed-in users to edit their non-unique User Name", async () => {
    getAuthenticatedAccount.mockResolvedValue({
      accountId: "alex_studies",
      role: "user",
      user: { id: "auth-user-id" },
    });

    const response = await POST(makeRequest({ userName: "Alex Study" }));

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ user_name: "Alex Study" });
    await expect(response.json()).resolves.toMatchObject({ accountId: "alex_studies", userName: "Alex" });
  });
});
