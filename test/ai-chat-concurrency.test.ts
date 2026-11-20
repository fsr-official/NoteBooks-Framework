import { beforeEach, describe, expect, it, vi } from "vitest";

const { evalRedis, setRedis } = vi.hoisted(() => ({
  evalRedis: vi.fn(),
  setRedis: vi.fn(),
}));

vi.mock("../src/lib/public-index-cache", () => ({
  getRedisClient: () => ({ eval: evalRedis, set: setRedis }),
}));

import { acquireAiChatRequestLock } from "../src/lib/ai-chat-concurrency";

describe("acquireAiChatRequestLock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRedis.mockResolvedValue("OK");
    evalRedis.mockResolvedValue(1);
  });

  it("uses an atomic expiring lock and releases only its own token", async () => {
    const release = await acquireAiChatRequestLock("account", "reader_user");

    expect(release).toBeTypeOf("function");
    expect(setRedis).toHaveBeenCalledWith(
      expect.stringMatching(/^notebooks:ai-chat-inflight:v1:account:[a-f0-9]{64}$/),
      expect.any(String),
      { nx: true, px: 180_000 },
    );

    await release?.();

    expect(evalRedis).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("get", KEYS[1]) == ARGV[1]'),
      [expect.stringMatching(/^notebooks:ai-chat-inflight:v1:account:[a-f0-9]{64}$/)],
      [expect.any(String)],
    );
  });

  it("returns null when another request already holds the lock", async () => {
    setRedis.mockResolvedValue(null);

    await expect(acquireAiChatRequestLock("anonymous-browser", "visitor-id")).resolves.toBeNull();
    expect(evalRedis).not.toHaveBeenCalled();
  });
});
