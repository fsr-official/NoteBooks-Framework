import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedAccount } from "@/lib/authenticated-account";
import {
  isChatRoom,
  parseChatCursor,
  toPublicMessage,
  validateChatText,
} from "@/lib/chat/messages";
import { consumeChatRateLimit } from "@/lib/chat/rate-limit";
import { acquireChatCooldown, listChatMessages, postChatMessage } from "@/lib/chat/store";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

const MAX_BODY_LENGTH = 4_000;

interface RouteContext {
  params: Promise<{ room: string }>;
}

function jsonError(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

async function getMessages(request: Request, context: RouteContext) {
  const { room } = await context.params;
  if (!isChatRoom(room)) return jsonError("Chat room not found.", 404);

  const cursor = parseChatCursor(new URL(request.url).searchParams.get("after"));
  if (!cursor.ok) return jsonError("The after cursor must be a non-negative integer.", 400);

  let messages;
  try {
    messages = await listChatMessages(room, cursor.after);
  } catch (error) {
    console.error("Chat messages could not be read", error);
    return jsonError("Chat is temporarily unavailable.", 503);
  }

  // Public data, identical for everyone with the same cursor: let the CDN
  // collapse many pollers into ~1 Redis read per few seconds.
  return NextResponse.json(
    { messages: messages.map(toPublicMessage) },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=3" } },
  );
}

async function postMessage(request: Request, context: RouteContext) {
  const { room } = await context.params;
  if (!isChatRoom(room)) return jsonError("Chat room not found.", 404);

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_LENGTH) return jsonError("Request body is too large.", 413);
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }
  const text = validateChatText(
    payload && typeof payload === "object" ? (payload as Record<string, unknown>).text : undefined,
  );
  if (!text.ok) return jsonError(text.error, 400);

  // Posting requires a signed-in account. Identity always comes from the
  // verified session — never from the request body.
  let account;
  try {
    account = await getAuthenticatedAccount(request);
  } catch (error) {
    console.error("Chat account verification failed", error);
    return jsonError("Unable to verify your account.", 503);
  }
  if (!account) return jsonError("Sign in to send messages.", 401);

  try {
    const cooldown = await acquireChatCooldown(account.accountId);
    if (!cooldown.allowed) {
      return jsonError("You’re sending messages too quickly.", 429, {
        "Retry-After": String(cooldown.retryAfterSeconds),
      });
    }
    const rateLimit = await consumeChatRateLimit(
      createHash("sha256").update(account.accountId).digest("hex"),
    );
    if (!rateLimit.allowed) {
      return jsonError("You’ve reached the chat message limit. Please try again later.", 429, {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      });
    }
  } catch (error) {
    console.error("Chat protection unavailable", error);
    return jsonError("Chat protection is temporarily unavailable.", 503);
  }

  let message;
  try {
    message = await postChatMessage({
      room,
      accountId: account.accountId,
      userName: account.userName,
      text: text.text,
    });
  } catch (error) {
    console.error("Chat message could not be stored", error);
    return jsonError("Chat is temporarily unavailable.", 503);
  }

  return NextResponse.json(
    { message: toPublicMessage(message) },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = withApiTelemetry("/api/chat/:room/messages", "GET", getMessages);
export const POST = withApiTelemetry("/api/chat/:room/messages", "POST", postMessage);
