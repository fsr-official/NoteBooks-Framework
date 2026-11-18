import { afterEach, describe, expect, it, vi } from "vitest";
import { clearReaderChatHistory } from "../src/lib/reader-chat-storage";

describe("clearReaderChatHistory", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("removes reader chat histories without clearing other browser data", () => {
    const values = new Map([
      ["notebooks:reader-chat:v1:science/physics/note.md", "chat-a"],
      ["notebooks:reader-chat:v1:commerce/economics/note.md", "chat-b"],
      ["notebooks:ai-chat:consent:v1", "accepted"],
      ["notebooks:reader-font:science/physics/note.md", "1.1"],
    ]);
    const storage: Storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => Array.from(values.keys())[index] ?? null,
      removeItem: (key) => { values.delete(key); },
      setItem: (key, value) => { values.set(key, String(value)); },
    };
    vi.stubGlobal("localStorage", storage);

    expect(clearReaderChatHistory()).toBe(2);
    expect(Array.from(values.keys())).toEqual([
      "notebooks:ai-chat:consent:v1",
      "notebooks:reader-font:science/physics/note.md",
    ]);
  });
});
