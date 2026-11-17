import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedAccount, createSupabaseAdminClient, from, update, eq, upsert } = vi.hoisted(() => ({
  getAuthenticatedAccount: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/authenticated-account", () => ({ getAuthenticatedAccount }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

import { POST } from "../src/app/api/account/session/route";

const SESSION_ID = "c52aa4f8-45a9-412a-9b38-705c6a9d2c10";

function makeRequest(sessionId: unknown) {
  return new Request("https://example.test/api/account/session", {
    method: "POST",
    headers: { authorization: "Bearer access-token", "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}

describe("POST /api/account/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedAccount.mockResolvedValue({
      accountId: "user-0123456789ab",
      userName: "GitHub User",
      role: "user",
      user: {
        id: "auth-user-id",
        identities: [{
          id: "1234567",
          provider: "github",
          identity_data: { login: "octocat" },
        }],
        user_metadata: {},
      },
    });
    update.mockReturnValue({ eq });
    eq.mockResolvedValue({ error: null });
    upsert.mockResolvedValue({ error: null });
    from.mockImplementation((table: string) => (
      table === "accounts" ? { update } : { upsert }
    ));
    createSupabaseAdminClient.mockReturnValue({ from });
  });

  it("binds the browser session and saves the verified GitHub identity", async () => {
    const response = await POST(makeRequest(SESSION_ID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authUserId: "auth-user-id",
      userId: "user-0123456789ab",
      userName: "octocat",
      githubUserId: "1234567",
      githubUsername: "octocat",
      needsSetup: true,
    });
    expect(update).toHaveBeenCalledWith({
      github_user_id: "1234567",
      github_username: "octocat",
      user_name: "octocat",
    });
    expect(upsert).toHaveBeenCalledWith({
      session_id: SESSION_ID,
      auth_user_id: "auth-user-id",
    }, { onConflict: "session_id" });
  });

  it("requires authentication and a valid session ID", async () => {
    getAuthenticatedAccount.mockResolvedValueOnce(null);
    expect((await POST(makeRequest(SESSION_ID))).status).toBe(401);
    expect((await POST(makeRequest("not-a-uuid"))).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("binds non-GitHub accounts without inventing provider data", async () => {
    getAuthenticatedAccount.mockResolvedValue({
      accountId: "alex_studies",
      userName: "Alex",
      role: "user",
      user: { id: "auth-user-id", identities: [], user_metadata: {} },
    });

    const response = await POST(makeRequest(SESSION_ID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      userId: "alex_studies",
      userName: "Alex",
      githubUserId: null,
      githubUsername: null,
      needsSetup: false,
    });
    expect(update).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledOnce();
  });
});
