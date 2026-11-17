import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import {
  consumeAuthRateLimit,
  type AuthRateLimitAction,
} from "@/lib/auth-rate-limit";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

const ACTIONS = new Set<AuthRateLimitAction>([
  "email-signup",
  "password-login",
  "signup-code-resend",
  "signup-code-verify",
  "password-reset",
]);

function responseError(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

async function postAuthRateLimit(request: Request) {
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return responseError("Request body is too large", 413);
    body = JSON.parse(raw);
  } catch {
    return responseError("Request body must be valid JSON", 400);
  }

  const action = body && typeof body === "object"
    ? (body as Record<string, unknown>).action
    : undefined;
  if (typeof action !== "string" || !ACTIONS.has(action as AuthRateLimitAction)) {
    return responseError("A valid authentication action is required", 400);
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwardedIps = request.headers.get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter((value) => isIP(value) !== 0);
  const forwardedIp = forwardedIps?.[forwardedIps.length - 1];
  const ip = realIp && isIP(realIp) !== 0 ? realIp : forwardedIp;
  if (!ip) {
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({ allowed: true, skipped: true }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    console.error("Authentication rate limit cannot determine the request IP");
    return responseError("Authentication protection is temporarily unavailable", 503);
  }

  const identifier = createHash("sha256").update(ip).digest("hex");
  let result;
  try {
    result = await consumeAuthRateLimit(action as AuthRateLimitAction, identifier);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Authentication rate limiter unavailable in local development", error);
      return NextResponse.json({ allowed: true, skipped: true }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    console.error("Authentication rate limiter unavailable", error);
    return responseError("Authentication protection is temporarily unavailable", 503);
  }

  const headers = {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    ...(result.allowed ? {} : { "Retry-After": String(result.retryAfterSeconds) }),
  };
  if (!result.allowed) {
    return responseError("Too many authentication attempts. Please try again later.", 429, headers);
  }
  return NextResponse.json({ allowed: true }, { headers: { "Cache-Control": "no-store", ...headers } });
}

export const POST = withApiTelemetry("/api/account/auth-rate-limit", "POST", postAuthRateLimit);
