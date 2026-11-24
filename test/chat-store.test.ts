import { beforeEach, describe, expect, it, vi } from "vitest";

const { redis } = vi.hoisted(() => ({
  redis: {
    eval: vi.fn(),
    zrange: vi.fn(),
    set: vi.fn(),
    pttl: vi.fn(),
  },
}));

vi.mock("../src/lib/public-index-cache", () => ({ getRedisClient: () => redis }));

import { CHAT_COOLDOWN_MS, CHAT_MAX_STORED, CHAT_TTL_SECONDS } from "../src/lib/chat/messages";
import {
  CHAT_POST_MESSAGE_SCRIPT,
  acquireChatCooldown,
  listChatMessages,
  postChatMessage,
} from "../src/lib/chat/store";

const stored = (seq: number, text = `m${seq}`) => JSON.stringify({
  seq, room: "global", accountId: "user-aaaaaaaaaaaa", userName: "Ann", text, createdAt: 1000 + seq,
});

beforeEach(() => vi.clearAllMocks());

describe("postChatMessage", () => {
  it("sends the body (without braces/seq) to the atomic script and returns the stored message", async () => {
    redis.eval.mockResolvedValue(42);
    const message = await postChatMessage({
      room: "global", accountId: "user-aaaaaaaaaaaa", userName: "Ann", text: 'say "hi"\nnow', now: 5000,
    });

    expect(message).toEqual({
      seq: 42, room: "global", accountId: "user-aaaaaaaaaaaa", userName: "Ann", text: 'say "hi"\nnow', createdAt: 5000,
    });
    const [script, keys, args] = redis.eval.mock.calls[0];
    expect(script).toBe(CHAT_POST_MESSAGE_SCRIPT);
    expect(keys).toEqual(["notebooks:chat:v1:global:seq", "notebooks:chat:v1:global:messages"]);
    expect(args.slice(1)).toEqual([String(CHAT_MAX_STORED), String(CHAT_TTL_SECONDS)]);

    // Re-assembling exactly what the Lua script does must give valid JSON that matches the message.
    const assembled = `{"seq":42,${args[0]}}`;
    expect(JSON.parse(assembled)).toEqual(message);
  });

  it("keeps hostile text inside the JSON string (quotes, braces, fake seq)", async () => {
    redis.eval.mockResolvedValue(3);
    const text = '","seq":999,"text":"x"}{';
    const message = await postChatMessage({ room: "global", accountId: "a", userName: "n", text });
    const assembled = JSON.parse(`{"seq":3,${redis.eval.mock.calls[0][2][0]}}`);
    expect(assembled.seq).toBe(3);
    expect(assembled.text).toBe(text);
    expect(message.seq).toBe(3);
  });

  it("rejects an invalid sequence from Redis", async () => {
    for (const bad of [null, "7", 0, -1, 1.5, undefined]) {
      redis.eval.mockResolvedValueOnce(bad);
      await expect(postChatMessage({ room: "global", accountId: "a", userName: "n", text: "t" })).rejects.toThrow();
    }
  });
});

describe("listChatMessages", () => {
  it("returns the newest page oldest-first when there is no cursor", async () => {
    redis.zrange.mockResolvedValue([stored(9), stored(8), stored(7)]); // reverse order from Redis
    const messages = await listChatMessages("global", null, 3);
    expect(redis.zrange).toHaveBeenCalledWith("notebooks:chat:v1:global:messages", 0, 2, { rev: true });
    expect(messages.map((m) => m.seq)).toEqual([7, 8, 9]);
  });

  it("reads strictly after the cursor, in order", async () => {
    redis.zrange.mockResolvedValue([stored(11), stored(12)]);
    const messages = await listChatMessages("global", 10);
    expect(redis.zrange).toHaveBeenCalledWith("notebooks:chat:v1:global:messages", 11, "+inf", {
      byScore: true, offset: 0, count: 50,
    });
    expect(messages.map((m) => m.seq)).toEqual([11, 12]);
  });

  it("accepts members the Redis client already decoded to objects, and skips corrupt ones", async () => {
    redis.zrange.mockResolvedValue([JSON.parse(stored(1)), "garbage", { seq: 2 }, stored(3)]);
    const messages = await listChatMessages("global", 0);
    expect(messages.map((m) => m.seq)).toEqual([1, 3]);
  });
});

describe("acquireChatCooldown", () => {
  it("allows the first message and sets a hashed, expiring key", async () => {
    redis.set.mockResolvedValue("OK");
    expect(await acquireChatCooldown("user-aaaaaaaaaaaa")).toEqual({ allowed: true });
    const [key, value, options] = redis.set.mock.calls[0];
    expect(key).toMatch(/^notebooks:chat:v1:cooldown:[0-9a-f]{64}$/);
    expect(key).not.toContain("user-aaaaaaaaaaaa");
    expect(value).toBe("1");
    expect(options).toEqual({ nx: true, px: CHAT_COOLDOWN_MS });
  });

  it("reports the remaining wait (rounded up) when still cooling down", async () => {
    redis.set.mockResolvedValue(null);
    redis.pttl.mockResolvedValue(1200);
    expect(await acquireChatCooldown("a")).toEqual({ allowed: false, retryAfterSeconds: 2 });
  });

  it("falls back to the full cooldown if the TTL is missing", async () => {
    redis.set.mockResolvedValue(null);
    redis.pttl.mockResolvedValue(-1);
    expect(await acquireChatCooldown("a")).toEqual({ allowed: false, retryAfterSeconds: 3 });
  });
});
