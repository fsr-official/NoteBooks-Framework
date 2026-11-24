/**
 * Community chat — shared, dependency-free pieces (safe to import from client
 * components): constants, types, and input validation.
 */

export const CHAT_ROOMS = ["global"] as const;
export type ChatRoom = (typeof CHAT_ROOMS)[number];

export const CHAT_MAX_LENGTH = 500;
/** Messages returned by one poll. */
export const CHAT_PAGE_SIZE = 50;
/** Messages kept per room; older ones are trimmed on every post. */
export const CHAT_MAX_STORED = 500;
/** Minimum gap between two messages from the same account. */
export const CHAT_COOLDOWN_MS = 3_000;
/** Rooms expire after this long without any new message. */
export const CHAT_TTL_SECONDS = 30 * 24 * 60 * 60;

/** What is stored in Redis (includes the author's account id for moderation). */
export interface ChatMessage {
  seq: number;
  room: ChatRoom;
  accountId: string;
  userName: string;
  text: string;
  /** Unix epoch milliseconds. */
  createdAt: number;
}

/** What the API returns to readers: never exposes the account id. */
export interface PublicChatMessage {
  seq: number;
  userName: string;
  text: string;
  createdAt: number;
}

export function isChatRoom(value: unknown): value is ChatRoom {
  return typeof value === "string" && (CHAT_ROOMS as readonly string[]).includes(value);
}

export function toPublicMessage(message: ChatMessage): PublicChatMessage {
  return {
    seq: message.seq,
    userName: message.userName,
    text: message.text,
    createdAt: message.createdAt,
  };
}

// Control characters (except \n), zero-width characters and bidirectional
// override/isolate characters that can be used to spoof or hide text.
const DISALLOWED_CHARACTERS =
  /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

export type ChatTextResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

/** Validate and clean user text. Rejects (never silently truncates) over-long input. */
export function validateChatText(input: unknown): ChatTextResult {
  if (typeof input !== "string") return { ok: false, error: "Message text is required." };
  // Cheap early bound so we never normalise a huge string.
  if (input.length > CHAT_MAX_LENGTH * 4) {
    return { ok: false, error: `Messages can be at most ${CHAT_MAX_LENGTH} characters.` };
  }
  const text = input
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(DISALLOWED_CHARACTERS, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length === 0) return { ok: false, error: "Message cannot be empty." };
  if (text.length > CHAT_MAX_LENGTH) {
    return { ok: false, error: `Messages can be at most ${CHAT_MAX_LENGTH} characters.` };
  }
  return { ok: true, text };
}

export type ChatCursorResult =
  | { ok: true; after: number | null }
  | { ok: false };

/** `?after=<seq>` — absent means "give me the latest page". */
export function parseChatCursor(value: string | null): ChatCursorResult {
  if (value === null || value === "") return { ok: true, after: null };
  if (!/^\d{1,15}$/.test(value)) return { ok: false };
  const after = Number(value);
  return Number.isSafeInteger(after) ? { ok: true, after } : { ok: false };
}

/** Parse + validate one stored sorted-set member (string or already-decoded object). */
export function readStoredMessage(value: unknown): ChatMessage | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== "object") return null;
  const m = candidate as Record<string, unknown>;
  if (typeof m.seq !== "number" || !Number.isSafeInteger(m.seq) || m.seq < 1
      || !isChatRoom(m.room)
      || typeof m.accountId !== "string"
      || typeof m.userName !== "string"
      || typeof m.text !== "string"
      || typeof m.createdAt !== "number" || !Number.isFinite(m.createdAt)) return null;
  return {
    seq: m.seq,
    room: m.room,
    accountId: m.accountId,
    userName: m.userName,
    text: m.text,
    createdAt: m.createdAt,
  };
}

/** Validate the `messages` array of an API response before the UI trusts it. */
export function readPublicMessages(value: unknown): PublicChatMessage[] {
  if (!Array.isArray(value)) return [];
  const messages: PublicChatMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    if (typeof m.seq === "number" && Number.isSafeInteger(m.seq) && m.seq >= 1
        && typeof m.userName === "string"
        && typeof m.text === "string"
        && typeof m.createdAt === "number" && Number.isFinite(m.createdAt)) {
      messages.push({ seq: m.seq, userName: m.userName, text: m.text, createdAt: m.createdAt });
    }
  }
  return messages;
}
