import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthenticatedAccount,
  createSupabaseAdminClient,
  from,
  rpc,
} = vi.hoisted(() => ({
  getAuthenticatedAccount: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/authenticated-account", () => ({ getAuthenticatedAccount }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));

import { GET, POST } from "../src/app/api/v1/keys/route";
import { DELETE } from "../src/app/api/v1/keys/[id]/route";

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

function configureQuery(result: QueryResult) {
  const query = {} as {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    then: ReturnType<typeof vi.fn>;
  };
  Object.assign(query, {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(async () => result),
    update: vi.fn(() => query),
    is: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    then: vi.fn((resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve)),
  });
  from.mockReturnValue(query);
  return query;
}

const account = {
  accountId: "student-01",
  user: { id: "auth-user-01" },
};

describe("API key management routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedAccount.mockResolvedValue(account);
    createSupabaseAdminClient.mockReturnValue({ from, rpc });
    rpc.mockResolvedValue({ data: [{ api_key_id: "11111111-1111-4111-8111-111111111111" }], error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a signed-in account to list, create, or revoke keys", async () => {
    getAuthenticatedAccount.mockResolvedValue(null);
    const request = new Request("https://example.test/api/v1/keys");

    expect((await GET(request)).status).toBe(401);
    expect((await POST(request)).status).toBe(401);
    expect((await DELETE(request, { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) })).status)
      .toBe(401);
  });

  it("lists account keys without caching and reports database errors", async () => {
    configureQuery({ data: [{ id: "key-1", name: "Laptop" }], error: null });
    const response = await GET(new Request("https://example.test/api/v1/keys"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ keys: [{ id: "key-1", name: "Laptop" }] });

    configureQuery({ data: null, error: { message: "database offline" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await GET(new Request("https://example.test/api/v1/keys"))).status).toBe(503);
  });

  it("validates create requests and reports active-key limits", async () => {
    const url = "https://example.test/api/v1/keys";
    expect((await POST(new Request(url, { method: "POST", body: "{" }))).status).toBe(400);
    expect((await POST(new Request(url, { method: "POST", body: JSON.stringify({ name: "  " }) }))).status).toBe(400);

    rpc.mockResolvedValue({ data: null, error: { message: "API_KEY_LIMIT_REACHED" } });
    expect((await POST(new Request(url, {
      method: "POST",
      body: JSON.stringify({ name: "Laptop" }),
    }))).status).toBe(409);
  });

  it("creates a one-time API key and validates revocation identifiers", async () => {
    const created = await POST(new Request("https://example.test/api/v1/keys", {
      method: "POST",
      body: JSON.stringify({ name: "  Laptop  " }),
    }));
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Laptop",
      warning: "Copy this key now. It cannot be retrieved again.",
    });
    expect(body.apiKey).toMatch(/^nbv2_[A-Za-z0-9_-]{43}$/);
    expect(created.headers.get("Cache-Control")).toBe("no-store");

    expect((await DELETE(
      new Request("https://example.test/api/v1/keys/not-a-uuid"),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    )).status).toBe(400);
  });

  it("revokes an active account-owned key and returns 404 for absent keys", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    configureQuery({ data: { id }, error: null });
    const revoked = await DELETE(
      new Request(`https://example.test/api/v1/keys/${id}`),
      { params: Promise.resolve({ id }) },
    );
    expect(revoked.status).toBe(200);
    await expect(revoked.json()).resolves.toEqual({ id, status: "revoked" });

    configureQuery({ data: null, error: null });
    expect((await DELETE(
      new Request(`https://example.test/api/v1/keys/${id}`),
      { params: Promise.resolve({ id }) },
    )).status).toBe(404);
  });
});
