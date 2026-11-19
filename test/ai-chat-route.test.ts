import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  completeGroqChat,
  consumeAiChatRateLimit,
  getAuthenticatedAccount,
  insert,
  rpc,
} = vi.hoisted(() => ({
  completeGroqChat: vi.fn(),
  consumeAiChatRateLimit: vi.fn(),
  getAuthenticatedAccount: vi.fn(),
  insert: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../src/lib/groq-chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/groq-chat")>();
  return { ...actual, completeGroqChat };
});
vi.mock("../src/lib/ai-rate-limit", () => ({ consumeAiChatRateLimit }));
vi.mock("../src/lib/authenticated-account", () => ({ getAuthenticatedAccount }));
vi.mock("../src/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: () => ({ insert }), rpc }),
}));

import { POST } from "../src/app/api/ai/chat/route";

const account = {
  accountId: "reader_user",
  userName: "Reader",
  role: "user" as const,
  user: { id: "auth-user-id" },
};

function payload(overrides: Record<string, unknown> = {}) {
  return {
    context: [{ title: "Chapter 1", text: "A short relevant excerpt." }],
    history: [{ role: "user", content: "Earlier question" }],
    message: "Explain this section.",
    noteTitle: "Physics",
    visitorId: "123e4567-e89b-12d3-a456-426614174000",
    webSearch: false,
    ...overrides,
  };
}

function makeRequest(body: unknown, authenticated = true) {
  return new Request("https://notes.example/api/ai/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.8",
      ...(authenticated ? { authorization: "Bearer valid-access-token" } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedAccount.mockResolvedValue(account);
    consumeAiChatRateLimit.mockResolvedValue({ allowed: true, remaining: 8 });
    completeGroqChat.mockResolvedValue({
      answer: "A helpful answer.",
      promptTokens: 110,
      completionTokens: 48,
      model: "openai/gpt-oss-120b",
      keySlot: "main",
    });
    insert.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores configured Turnstile and records token usage and remaining allowance", async () => {
    vi.stubEnv("APP_BASE_URL", "https://notes.example");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "configured-site-key");
    const response = await POST(makeRequest(payload()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      answer: "A helpful answer.",
      tier: "low",
      usage: { promptTokens: 110, completionTokens: 48, requestsRemaining: 8 },
    });
    expect(consumeAiChatRateLimit).toHaveBeenCalledWith("account", expect.any(String));
    expect(completeGroqChat).toHaveBeenCalledWith(expect.objectContaining({
      tier: "low",
      message: "Explain this section.",
      context: [{ title: "Chapter 1", text: "A short relevant excerpt." }],
    }));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      account_id: "reader_user",
      prompt_tokens: 110,
      completion_tokens: 48,
      key_slot: "main",
    }));
    expect(rpc).toHaveBeenCalledWith("record_ai_provider_key_usage", {
      p_key_slot: "main",
      p_prompt_tokens: 110,
      p_completion_tokens: 48,
    });
  });

  it("limits anonymous users by both IP and browser and does not store their usage", async () => {
    getAuthenticatedAccount.mockResolvedValue(null);

    const response = await POST(makeRequest(payload(), false));

    expect(response.status).toBe(200);
    expect(consumeAiChatRateLimit).toHaveBeenNthCalledWith(1, "anonymous-ip", expect.any(String));
    expect(consumeAiChatRateLimit).toHaveBeenNthCalledWith(2, "anonymous-browser", expect.any(String));
    expect(insert).not.toHaveBeenCalled();
  });

  it("requires sign-in for Medium, High, or Extra effort", async () => {
    getAuthenticatedAccount.mockResolvedValue(null);
    const response = await POST(makeRequest(payload({ tier: "high" }), false));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("Sign in") });
    expect(consumeAiChatRateLimit).not.toHaveBeenCalled();
    expect(completeGroqChat).not.toHaveBeenCalled();
  });

  it("rejects unknown AI tiers", async () => {
    const response = await POST(makeRequest(payload({ tier: "unlimited" })));
    expect(response.status).toBe(400);
    expect(completeGroqChat).not.toHaveBeenCalled();
  });

  it("fails closed on rate-limit outages and does not call Groq", async () => {
    consumeAiChatRateLimit.mockRejectedValueOnce(new Error("Redis unavailable"));
    const response = await POST(makeRequest(payload()));
    expect(response.status).toBe(503);
    expect(completeGroqChat).not.toHaveBeenCalled();
  });

  it("propagates provider limits with a retry delay", async () => {
    const { GroqChatError } = await import("../src/lib/groq-chat");
    completeGroqChat.mockRejectedValueOnce(new GroqChatError("Wait before retrying.", 429, 12));
    const response = await POST(makeRequest(payload()));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
    expect(insert).not.toHaveBeenCalled();
  });
});
