import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { incr } = vi.hoisted(() => ({ incr: vi.fn() }));
vi.mock("../src/lib/public-index-cache", () => ({
  getRedisClient: () => ({ incr }),
}));

import { completeGroqChat } from "../src/lib/groq-chat";

describe("completeGroqChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GROQ_API_KEY_MAIN", "main-key");
    vi.stubEnv("GROQ_API_KEY_SCIENCE", "science-key");
    vi.stubEnv("GROQ_API_KEY_COMMERCE", "commerce-key");
    vi.stubEnv("GROQ_API_KEY_HUMANITIES", "humanities-key");
    vi.stubEnv("GROQ_API_KEY_LOWER_SECONDARY", "lower-key");
    incr.mockResolvedValue(1);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "A grounded answer." } }],
      usage: { prompt_tokens: 80, completion_tokens: 22 },
    }), { status: 200 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses the chosen model and rotates evenly through configured keys", async () => {
    const first = await completeGroqChat({
      tier: "low",
      message: "Explain this.",
      history: [],
      context: [{ title: "Section 1", text: "Relevant note text." }],
      noteTitle: "Physics",
      webSearch: false,
    });
    incr.mockResolvedValueOnce(2);
    const second = await completeGroqChat({
      tier: "low",
      message: "Explain this.",
      history: [],
      context: [],
      noteTitle: "Physics",
      webSearch: false,
    });

    expect(first).toMatchObject({
      answer: "A grounded answer.",
      promptTokens: 80,
      completionTokens: 22,
      model: "llama-3.1-8b-instant",
      keySlot: "main",
    });
    expect(second.keySlot).toBe("science");
    const firstRequest = vi.mocked(fetch).mock.calls[0];
    expect(firstRequest[1]?.headers).toMatchObject({ authorization: "Bearer main-key" });
    const firstBody = JSON.parse(String(firstRequest[1]?.body)) as {
      model: string;
      max_completion_tokens: number;
      tools?: unknown[];
      messages: Array<{ content: string }>;
    };
    expect(firstBody.model).toBe("llama-3.1-8b-instant");
    expect(firstBody.max_completion_tokens).toBe(512);
    expect(firstBody.tools).toBeUndefined();
    expect(firstBody.messages[0].content).toContain("Relevant note excerpts");
  });

  it("only enables browser search when explicitly requested", async () => {
    incr.mockResolvedValue(1);
    await completeGroqChat({
      tier: "low",
      message: "Find a recent source.",
      history: [],
      context: [],
      noteTitle: "Physics",
      webSearch: true,
    });
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)) as {
      tools?: Array<{ type: string }>;
      tool_choice?: string;
    };
    expect(body.tools).toEqual([{ type: "browser_search" }]);
    expect(body.tool_choice).toBe("auto");
  });

  it("fails explicitly when no key is configured or Groq rejects the request", async () => {
    vi.stubEnv("GROQ_API_KEY_MAIN", "");
    vi.stubEnv("GROQ_API_KEY_SCIENCE", "");
    vi.stubEnv("GROQ_API_KEY_COMMERCE", "");
    vi.stubEnv("GROQ_API_KEY_HUMANITIES", "");
    vi.stubEnv("GROQ_API_KEY_LOWER_SECONDARY", "");
    await expect(completeGroqChat({
      tier: "low",
      message: "Hello",
      history: [],
      context: [],
      noteTitle: "Physics",
      webSearch: false,
    })).rejects.toThrow("not configured");

    vi.stubEnv("GROQ_API_KEY_MAIN", "main-key");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "9" } }));
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "9" } }));
    await expect(completeGroqChat({
      tier: "low",
      message: "Hello",
      history: [],
      context: [],
      noteTitle: "Physics",
      webSearch: false,
    })).rejects.toMatchObject({ status: 429, retryAfterSeconds: 9 });
  });

  it("applies the selected model, output ceiling, and reasoning setting for each tier", async () => {
    const expectations = [
      { tier: "medium", model: "openai/gpt-oss-20b", max: 1000, effort: "low" },
      { tier: "high", model: "llama-3.3-70b-versatile", max: 1500 },
      { tier: "extra", model: "openai/gpt-oss-120b", max: 3000, effort: "high" },
    ] as const;
    for (const expected of expectations) {
      await completeGroqChat({
        tier: expected.tier,
        message: "Explain this.",
        history: [],
        context: [],
        noteTitle: "Physics",
        webSearch: false,
      });
      const body = JSON.parse(String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body)) as {
        model: string;
        max_completion_tokens: number;
        reasoning_effort?: string;
      };
      expect(body).toMatchObject({
        model: expected.model,
        max_completion_tokens: expected.max,
        ...("effort" in expected ? { reasoning_effort: expected.effort } : {}),
      });
    }
  });

  it("falls back to the next tier model when the primary model is rate limited", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "Fallback answer." } }],
        usage: { prompt_tokens: 80, completion_tokens: 22 },
      }), { status: 200 }));

    const result = await completeGroqChat({
      tier: "low",
      message: "Explain this.",
      history: [],
      context: [],
      noteTitle: "Physics",
      webSearch: false,
    });

    expect(result).toMatchObject({ answer: "Fallback answer.", model: "openai/gpt-oss-20b" });
    const fallbackBody = JSON.parse(String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body)) as { model: string };
    expect(fallbackBody.model).toBe("openai/gpt-oss-20b");
  });

  it("trims history and note context to the selected input budget", async () => {
    await completeGroqChat({
      tier: "low",
      message: "Explain this.",
      history: Array.from({ length: 6 }, (_, index) => ({
        role: index % 2 ? "assistant" as const : "user" as const,
        content: "Earlier conversation. ".repeat(100),
      })),
      context: [{ title: "Long section", text: "Relevant note text. ".repeat(500) }],
      noteTitle: "Physics",
      webSearch: false,
    });

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(body.messages.reduce((total, entry) => total + entry.content.length, 0)).toBeLessThanOrEqual(1500 * 3);
    expect(body.messages[0].content).toContain("Relevant note excerpts");
  });
});
