import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { isAiTier, type AiTier } from "@/lib/ai-tiers";
import { acquireAiChatRequestLock } from "@/lib/ai-chat-concurrency";
import {
  completeGroqChat,
  GroqChatError,
  type GroqContextSection,
  type GroqMessage,
} from "@/lib/groq-chat";
import { consumeAiChatRateLimit } from "@/lib/ai-rate-limit";
import { getAuthenticatedAccount } from "@/lib/authenticated-account";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

const MAX_BODY_LENGTH = 64_000;
const MAX_CONTEXT_LENGTH = 12_000;
const MAX_HISTORY_LENGTH = 6;
const MAX_HISTORY_CONTENT_LENGTH = 12_000;

function jsonError(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requestIp(request: Request): string | null {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && isIP(realIp) !== 0) return realIp;
  const forwardedIps = request.headers.get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter((value) => isIP(value) !== 0);
  return forwardedIps?.[forwardedIps.length - 1] ?? null;
}

function readChatPayload(value: unknown): {
  tier: AiTier;
  message: string;
  history: GroqMessage[];
  context: GroqContextSection[];
  noteTitle: string;
  webSearch: boolean;
  visitorId: string;
} | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const tier = body.tier === undefined ? "low" : body.tier;
  if (typeof body.message !== "string" || body.message.trim().length === 0
      || body.message.length > 4000
      || typeof body.noteTitle !== "string" || body.noteTitle.length > 300
      || !isAiTier(tier)
      || typeof body.webSearch !== "boolean"
      || typeof body.visitorId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.visitorId)
      || !Array.isArray(body.history) || body.history.length > MAX_HISTORY_LENGTH
      || !Array.isArray(body.context) || body.context.length > 8) return null;

  const history: GroqMessage[] = [];
  let historyLength = 0;
  for (const item of body.history) {
    if (!item || typeof item !== "object") return null;
    const entry = item as Record<string, unknown>;
    if ((entry.role !== "user" && entry.role !== "assistant")
        || typeof entry.content !== "string" || entry.content.length > 4000) return null;
    historyLength += entry.content.length;
    if (historyLength > MAX_HISTORY_CONTENT_LENGTH) return null;
    history.push({ role: entry.role, content: entry.content });
  }

  const context: GroqContextSection[] = [];
  let contextLength = 0;
  for (const item of body.context) {
    if (!item || typeof item !== "object") return null;
    const section = item as Record<string, unknown>;
    if (typeof section.title !== "string" || section.title.length > 300
        || typeof section.text !== "string" || section.text.length > MAX_CONTEXT_LENGTH) return null;
    contextLength += section.text.length;
    if (contextLength > MAX_CONTEXT_LENGTH) return null;
    context.push({ title: section.title, text: section.text });
  }

  return {
    tier,
    message: body.message.trim(),
    history,
    context,
    noteTitle: body.noteTitle.trim() || "Untitled note",
    webSearch: body.webSearch,
    visitorId: body.visitorId,
  };
}

async function postAiChat(request: Request) {
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_LENGTH) return jsonError("Request body is too large.", 413);
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody);
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }
  const payload = readChatPayload(rawPayload);
  if (!payload) return jsonError("The chat request is invalid or too large.", 400);

  let account = null;
  if (request.headers.has("authorization")) {
    try {
      account = await getAuthenticatedAccount(request);
    } catch (error) {
      console.error("AI chat account verification failed", error);
      return jsonError("Unable to verify your account.", 503);
    }
    if (!account) return jsonError("Your sign-in has expired. Please sign in again.", 401);
  }
  if (!account && payload.tier !== "low") {
    return jsonError("Sign in to use Medium, High, or Extra AI effort. Low is available without an account.", 403);
  }

  const ip = requestIp(request);
  if (!ip && process.env.NODE_ENV === "production") {
    console.error("AI chat rate limiter cannot determine the request IP");
    return jsonError("AI chat protection is temporarily unavailable.", 503);
  }
  const rateLimitIdentifiers = account
    ? [{ scope: "account" as const, id: hashIdentifier(account.accountId) }]
    : [
        { scope: "anonymous-ip" as const, id: hashIdentifier(ip ?? "local-development") },
        { scope: "anonymous-browser" as const, id: hashIdentifier(payload.visitorId) },
      ];
  let releaseRequestLock: (() => Promise<void>) | null;
  try {
    releaseRequestLock = await acquireAiChatRequestLock(
      account ? "account" : "anonymous-browser",
      account?.accountId ?? payload.visitorId,
    );
  } catch (error) {
    console.error("AI chat concurrency guard unavailable", error);
    return jsonError("AI chat protection is temporarily unavailable.", 503);
  }
  if (!releaseRequestLock) {
    return jsonError("You already have an AI request in progress. Please wait for it to finish.", 409, {
      "Retry-After": "5",
    });
  }

  try {
    let requestsRemaining = Number.POSITIVE_INFINITY;
    try {
      for (const identifier of rateLimitIdentifiers) {
        const rateLimit = await consumeAiChatRateLimit(identifier.scope, identifier.id);
        if (!rateLimit.allowed) {
          return jsonError("You’ve reached the AI chat limit. Please try again later.", 429, {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          });
        }
        requestsRemaining = Math.min(requestsRemaining, rateLimit.remaining);
      }
    } catch (error) {
      console.error("AI chat rate limiter unavailable", error);
      return jsonError("AI chat protection is temporarily unavailable.", 503);
    }

    let result;
    try {
      result = await completeGroqChat(payload);
    } catch (error) {
      if (error instanceof GroqChatError) {
        return jsonError(error.message, error.status, error.retryAfterSeconds
          ? { "Retry-After": String(error.retryAfterSeconds) }
          : undefined);
      }
      console.error("AI chat provider unavailable", error);
      return jsonError("The AI service is temporarily unavailable.", 503);
    }

    try {
      const { error } = await createSupabaseAdminClient().rpc("record_ai_provider_key_usage", {
        p_key_slot: result.keySlot,
        p_prompt_tokens: result.promptTokens,
        p_completion_tokens: result.completionTokens,
      });
      if (error) throw error;
    } catch (error) {
      console.error("AI provider key usage could not be recorded", {
        keySlot: result.keySlot,
        error,
      });
    }

    if (account) {
      try {
        const { error } = await createSupabaseAdminClient().from("ai_usage_events").insert({
          request_id: randomUUID(),
          account_id: account.accountId,
          model: result.model,
          key_slot: result.keySlot,
          prompt_tokens: result.promptTokens,
          completion_tokens: result.completionTokens,
        });
        if (error) throw error;
      } catch (error) {
        console.error("AI chat usage could not be recorded", error);
        return jsonError("The answer was generated but its usage could not be recorded. Please retry.", 503);
      }
    }

    return NextResponse.json({
      answer: result.answer,
      usage: {
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        requestsRemaining,
      },
      model: result.model,
      tier: payload.tier,
    }, { headers: { "Cache-Control": "no-store" } });
  } finally {
    try {
      await releaseRequestLock();
    } catch (error) {
      console.error("AI chat request lock could not be released; it will expire automatically", error);
    }
  }
}

export const POST = withApiTelemetry("/api/ai/chat", "POST", postAiChat);
