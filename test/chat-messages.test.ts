import { describe, expect, it } from "vitest";
import {
  CHAT_MAX_LENGTH,
  isChatRoom,
  parseChatCursor,
  readPublicMessages,
  readStoredMessage,
  toPublicMessage,
  validateChatText,
} from "../src/lib/chat/messages";

describe("validateChatText", () => {
  it("accepts and trims normal text", () => {
    expect(validateChatText("  hello world \n")).toEqual({ ok: true, text: "hello world" });
  });

  it("rejects non-strings, empty and whitespace-only text", () => {
    for (const value of [undefined, null, 42, {}, [], "", "   ", "\n\n\t"]) {
      expect(validateChatText(value).ok).toBe(false);
    }
  });

  it("enforces the length limit without truncating", () => {
    expect(validateChatText("a".repeat(CHAT_MAX_LENGTH)).ok).toBe(true);
    expect(validateChatText("a".repeat(CHAT_MAX_LENGTH + 1)).ok).toBe(false);
    expect(validateChatText("a".repeat(CHAT_MAX_LENGTH * 10)).ok).toBe(false);
  });

  it("strips control, zero-width and bidi-override characters", () => {
    const result = validateChatText("a\u0000b\u200Bc\u202Ed\u2066e\uFEFFf\u0007g");
    expect(result).toEqual({ ok: true, text: "abcdefg" });
  });

  it("normalises line endings, tabs and blank-line runs", () => {
    expect(validateChatText("a\r\nb\rc\td\n\n\n\n\ne")).toEqual({ ok: true, text: "a\nb\nc d\n\ne" });
  });

  it("measures length after cleaning, so invisible padding cannot hide an empty message", () => {
    expect(validateChatText("\u200B\u200B\u200B").ok).toBe(false);
  });

  it("leaves HTML untouched (it is rendered as text, never as markup)", () => {
    expect(validateChatText("<img src=x onerror=alert(1)>")).toEqual({
      ok: true,
      text: "<img src=x onerror=alert(1)>",
    });
  });
});

describe("parseChatCursor", () => {
  it("treats a missing cursor as 'latest page'", () => {
    expect(parseChatCursor(null)).toEqual({ ok: true, after: null });
    expect(parseChatCursor("")).toEqual({ ok: true, after: null });
  });

  it("accepts non-negative integers", () => {
    expect(parseChatCursor("0")).toEqual({ ok: true, after: 0 });
    expect(parseChatCursor("12345")).toEqual({ ok: true, after: 12345 });
  });

  it("rejects everything else", () => {
    for (const value of ["-1", "1.5", "1e3", "abc", "0x10", " 5", "5 ", "9".repeat(16), "NaN"]) {
      expect(parseChatCursor(value)).toEqual({ ok: false });
    }
  });
});

describe("isChatRoom", () => {
  it("only allows known rooms", () => {
    expect(isChatRoom("global")).toBe(true);
    for (const value of ["", "Global", "../global", "admin", undefined, 1]) {
      expect(isChatRoom(value)).toBe(false);
    }
  });
});

describe("readStoredMessage / toPublicMessage", () => {
  const stored = {
    seq: 7,
    room: "global",
    accountId: "user-abc123abc123",
    userName: "Ann",
    text: "hi",
    createdAt: 1_700_000_000_000,
  };

  it("parses JSON strings and already-decoded objects", () => {
    expect(readStoredMessage(JSON.stringify(stored))).toEqual(stored);
    expect(readStoredMessage(stored)).toEqual(stored);
  });

  it("rejects malformed or tampered members", () => {
    for (const value of [
      "not json",
      null,
      42,
      { ...stored, seq: 0 },
      { ...stored, seq: 1.5 },
      { ...stored, room: "other" },
      { ...stored, text: 5 },
      { ...stored, createdAt: "now" },
      { ...stored, accountId: undefined },
    ]) {
      expect(readStoredMessage(value)).toBeNull();
    }
  });

  it("never exposes the account id publicly", () => {
    const message = readStoredMessage(stored)!;
    expect(toPublicMessage(message)).toEqual({ seq: 7, userName: "Ann", text: "hi", createdAt: 1_700_000_000_000 });
    expect(JSON.stringify(toPublicMessage(message))).not.toContain("user-abc123abc123");
  });
});

describe("readPublicMessages", () => {
  it("keeps well-formed messages and drops everything else", () => {
    const good = { seq: 1, userName: "Ann", text: "hi", createdAt: 1 };
    expect(readPublicMessages([good, null, 5, "x", { ...good, seq: 0 }, { ...good, text: 1 }, good]))
      .toEqual([good, good]);
    expect(readPublicMessages(undefined)).toEqual([]);
    expect(readPublicMessages({ not: "an array" })).toEqual([]);
  });
});
