import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  acquireChatCooldown,
  consumeChatRateLimit,
  getAuthenticatedAccount,
  listChatMessages,
  postChatMessage,
} = vi.hoisted(() => ({
  acquireChatCooldown: vi.fn(),
  consumeChatRateLimit: vi.fn(),
  getAuthenticatedAccount: vi.fn(),
  listChatMessages: vi.fn(),
  postChatMessage: vi.fn(),
}));

vi.mock("../src/lib/authenticated-account", () => ({ getAuthenticatedAccount }));
vi.mock("../src/lib/chat/rate-limit", () => ({ consumeChatRateLimit }));
vi.mock("../src/lib/chat/store", () => ({ acquireChatCooldown, listChatMessages, postChatMessage }));

import { GET, POST } from "../src/app/api/chat/[room]/messages/route";

const account = {
  accountId: "reader_user",
  userName: "Reader",
  role: "user" as const,
  user: { id: "auth-user-id" },
};

const context = (room = "global") => ({ params: Promise.resolve({ room }) });

function get(query = "", room = "global") {
  return GET(new Request(`https://notes.example/api/chat/${room}/messages${query}`), context(room));
}

function post(body: unknown, { authenticated = true, room = "global", raw }: {
  authenticated?: boolean; room?: string; raw?: string;
} = {}) {
  return POST(new Request(`https://notes.example/api/chat/${room}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authenticated ? { authorization: "Bearer valid-access-token" } : {}),
    },
    body: raw ?? JSON.stringify(body),
  }), context(room));
}

const stored = (seq: number) => ({
  seq, room: "global" as const, accountId: "secret-account-id", userName: "Ann", text: `m${seq}`, createdAt: 1000 + seq,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  // Mirror the real helper: no Authorization header means no account.
  getAuthenticatedAccount.mockImplementation(async (request: Request) =>
    request.headers.has("authorization") ? account : null);
  acquireChatCooldown.mockResolvedValue({ allowed: true });
  consumeChatRateLimit.mockResolvedValue({ allowed: true });
  listChatMessages.mockResolvedValue([stored(1), stored(2)]);
  postChatMessage.mockImplementation(async (input) => ({ seq: 3, createdAt: 5000, ...input }));
});

describe("GET /api/chat/[room]/messages", () => {
  it("returns public messages without account ids and with short CDN caching", async () => {
    const response = await get("?after=0");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=3");
    const body = await response.json();
    expect(body.messages).toEqual([
      { seq: 1, userName: "Ann", text: "m1", createdAt: 1001 },
      { seq: 2, userName: "Ann", text: "m2", createdAt: 1002 },
    ]);
    expect(JSON.stringify(body)).not.toContain("secret-account-id");
    expect(listChatMessages).toHaveBeenCalledWith("global", 0);
  });

  it("works without any sign-in and defaults to the latest page", async () => {
    expect((await get()).status).toBe(200);
    expect(getAuthenticatedAccount).not.toHaveBeenCalled();
    expect(listChatMessages).toHaveBeenCalledWith("global", null);
  });

  it("404s unknown rooms and 400s bad cursors without touching Redis", async () => {
    expect((await get("", "nope")).status).toBe(404);
    for (const bad of ["?after=-1", "?after=abc", "?after=1.5"]) {
      expect((await get(bad)).status).toBe(400);
    }
    expect(listChatMessages).not.toHaveBeenCalled();
  });

  it("returns an uncached 503 when Redis fails", async () => {
    listChatMessages.mockRejectedValue(new Error("redis down"));
    const response = await get();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("POST /api/chat/[room]/messages", () => {
  it("stores the message under the verified identity and returns 201", async () => {
    const response = await post({ text: "  hello  " });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(postChatMessage).toHaveBeenCalledWith({
      room: "global", accountId: "reader_user", userName: "Reader", text: "hello",
    });
    const body = await response.json();
    expect(body.message).toEqual({ seq: 3, userName: "Reader", text: "hello", createdAt: 5000 });
    expect(JSON.stringify(body)).not.toContain("reader_user");
  });

  it("ignores any identity the client tries to supply", async () => {
    await post({ text: "hi", userName: "Admin", accountId: "someone-else", role: "admin" });
    expect(postChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "reader_user", userName: "Reader",
    }));
  });

  it("requires a valid sign-in", async () => {
    expect((await post({ text: "hi" }, { authenticated: false })).status).toBe(401);
    getAuthenticatedAccount.mockResolvedValueOnce(null);
    expect((await post({ text: "hi" })).status).toBe(401);
    expect(postChatMessage).not.toHaveBeenCalled();
  });

  it("returns 503 when the account cannot be verified", async () => {
    getAuthenticatedAccount.mockRejectedValue(new Error("supabase down"));
    expect((await post({ text: "hi" })).status).toBe(503);
    expect(postChatMessage).not.toHaveBeenCalled();
  });

  it("validates the payload before doing any auth or Redis work", async () => {
    expect((await post(null, { raw: "{not json" })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post({ text: "   " })).status).toBe(400);
    expect((await post({ text: 5 })).status).toBe(400);
    expect((await post({ text: "a".repeat(501) })).status).toBe(400);
    expect((await post({ text: "x".repeat(5000) })).status).toBe(413);
    expect((await post({ text: "hi" }, { room: "nope" })).status).toBe(404);
    expect(getAuthenticatedAccount).not.toHaveBeenCalled();
    expect(postChatMessage).not.toHaveBeenCalled();
  });

  it("enforces the per-message cooldown with Retry-After", async () => {
    acquireChatCooldown.mockResolvedValue({ allowed: false, retryAfterSeconds: 2 });
    const response = await post({ text: "hi" });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("2");
    expect(postChatMessage).not.toHaveBeenCalled();
    expect(consumeChatRateLimit).not.toHaveBeenCalled();
  });

  it("enforces the burst/daily rate limit with Retry-After", async () => {
    consumeChatRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 41 });
    const response = await post({ text: "hi" });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("41");
    expect(postChatMessage).not.toHaveBeenCalled();
  });

  it("hashes the account id before using it as a rate-limit key", async () => {
    await post({ text: "hi" });
    const key = consumeChatRateLimit.mock.calls[0][0];
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails closed (503) when the protection layer is down", async () => {
    acquireChatCooldown.mockRejectedValue(new Error("redis down"));
    expect((await post({ text: "hi" })).status).toBe(503);
    acquireChatCooldown.mockResolvedValue({ allowed: true });
    consumeChatRateLimit.mockRejectedValue(new Error("redis down"));
    expect((await post({ text: "hi" })).status).toBe(503);
    expect(postChatMessage).not.toHaveBeenCalled();
  });

  it("returns 503 if the message cannot be stored", async () => {
    postChatMessage.mockRejectedValue(new Error("redis down"));
    expect((await post({ text: "hi" })).status).toBe(503);
  });
});
