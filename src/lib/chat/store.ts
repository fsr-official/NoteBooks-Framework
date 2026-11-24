import "server-only";

import { createHash } from "node:crypto";
import { getRedisClient } from "@/lib/public-index-cache";
import {
  CHAT_COOLDOWN_MS,
  CHAT_MAX_STORED,
  CHAT_PAGE_SIZE,
  CHAT_TTL_SECONDS,
  readStoredMessage,
  type ChatMessage,
  type ChatRoom,
} from "@/lib/chat/messages";

const PREFIX = "notebooks:chat:v1";

const seqKey = (room: ChatRoom) => `${PREFIX}:${room}:seq`;
const messagesKey = (room: ChatRoom) => `${PREFIX}:${room}:messages`;
const cooldownKey = (accountId: string) =>
  `${PREFIX}:cooldown:${createHash("sha256").update(accountId).digest("hex")}`;

/**
 * Atomically: take the next sequence number, store the message under it, trim
 * the room to the newest N, and refresh the TTLs. Doing this in one script means
 * a reader can never see message #6 before #5 exists (which would make a
 * cursor-based poller skip #5 forever).
 *
 * ARGV[1] is the message body as JSON *without* the surrounding braces and
 * without `seq`; the script prepends the sequence number. Plain string
 * concatenation keeps this independent of any Lua JSON library.
 */
const POST_MESSAGE_SCRIPT = `
local seq = redis.call("INCR", KEYS[1])
redis.call("ZADD", KEYS[2], seq, '{"seq":' .. seq .. ',' .. ARGV[1] .. '}')
redis.call("ZREMRANGEBYRANK", KEYS[2], 0, -(tonumber(ARGV[2]) + 1))
redis.call("EXPIRE", KEYS[1], tonumber(ARGV[3]))
redis.call("EXPIRE", KEYS[2], tonumber(ARGV[3]))
return seq
`;

export const CHAT_POST_MESSAGE_SCRIPT = POST_MESSAGE_SCRIPT;

export interface NewChatMessage {
  room: ChatRoom;
  accountId: string;
  userName: string;
  text: string;
  now?: number;
}

export async function postChatMessage(input: NewChatMessage): Promise<ChatMessage> {
  const createdAt = input.now ?? Date.now();
  const body = {
    room: input.room,
    accountId: input.accountId,
    userName: input.userName,
    text: input.text,
    createdAt,
  };
  const seq = await getRedisClient().eval(
    POST_MESSAGE_SCRIPT,
    [seqKey(input.room), messagesKey(input.room)],
    [JSON.stringify(body).slice(1, -1), String(CHAT_MAX_STORED), String(CHAT_TTL_SECONDS)],
  );
  if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 1) {
    throw new Error("Redis returned an invalid chat sequence number");
  }
  return { seq, ...body };
}

/**
 * Newest page when `after` is null; otherwise the oldest `limit` messages that
 * come after the cursor (so a client that fell far behind catches up in order).
 */
export async function listChatMessages(
  room: ChatRoom,
  after: number | null,
  limit: number = CHAT_PAGE_SIZE,
): Promise<ChatMessage[]> {
  const redis = getRedisClient();
  const raw: unknown[] = after === null
    ? (await redis.zrange(messagesKey(room), 0, limit - 1, { rev: true })).reverse()
    : await redis.zrange(messagesKey(room), after + 1, "+inf", {
      byScore: true,
      offset: 0,
      count: limit,
    });
  const messages: ChatMessage[] = [];
  for (const item of raw) {
    const message = readStoredMessage(item);
    if (message) messages.push(message);
  }
  return messages;
}

export type ChatCooldownResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** One message per account every CHAT_COOLDOWN_MS. */
export async function acquireChatCooldown(accountId: string): Promise<ChatCooldownResult> {
  const redis = getRedisClient();
  const key = cooldownKey(accountId);
  const acquired = await redis.set(key, "1", { nx: true, px: CHAT_COOLDOWN_MS });
  if (acquired === "OK") return { allowed: true };
  const remainingMs = await redis.pttl(key);
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((remainingMs > 0 ? remainingMs : CHAT_COOLDOWN_MS) / 1000)),
  };
}
