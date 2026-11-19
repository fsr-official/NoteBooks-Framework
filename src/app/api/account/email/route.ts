import { NextResponse } from "next/server";
import { getAuthenticatedAccount } from "@/lib/authenticated-account";
import { consumeAuthRateLimit } from "@/lib/auth-rate-limit";
import { isTurnstileVerificationValid } from "@/lib/turnstile-policy";
import { verifyTurnstileToken } from "@/lib/turnstile-verification";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

async function verifyEmailChange(request: Request) {
  let account;
  try {
    account = await getAuthenticatedAccount(request);
  } catch (error) {
    console.error("Email change account verification failed", error);
    return errorResponse("Unable to verify your account", 503);
  }
  if (!account) return errorResponse("A valid sign-in is required", 401);

  let rateLimit;
  try {
    rateLimit = await consumeAuthRateLimit("email-change", account.user.id);
  } catch (error) {
    console.error("Email change rate limiter unavailable", error);
    return errorResponse("Email change protection is temporarily unavailable", 503);
  }
  if (!rateLimit.allowed) {
    return errorResponse("Too many email change attempts. Please try again later.", 429, {
      "Retry-After": String(rateLimit.retryAfterSeconds),
      "RateLimit-Limit": String(rateLimit.limit),
      "RateLimit-Remaining": String(rateLimit.remaining),
    });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return errorResponse("A valid sign-in is required", 401);

  const rawBody = await request.text();
  if (rawBody.length > 4096) return errorResponse("Request body is too large", 413);

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return errorResponse("Request body must be valid JSON", 400);
  }

  const values = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const captchaToken = typeof values.captchaToken === "string" ? values.captchaToken : "";
  if (!captchaToken || captchaToken.length > 2048) {
    return errorResponse("Complete the security check before continuing", 400);
  }

  const appBaseUrl = process.env.APP_BASE_URL;
  if (!appBaseUrl) {
    console.error("Email change requires APP_BASE_URL configuration");
    return errorResponse("Email changes are temporarily unavailable", 503);
  }

  let captchaResult;
  try {
    captchaResult = await verifyTurnstileToken(captchaToken);
  } catch (error) {
    console.error("Email change CAPTCHA verification failed", error);
    return errorResponse("Unable to verify the security check. Please try again later.", 503);
  }
  let expectedHostname: string;
  try {
    expectedHostname = new URL(appBaseUrl).hostname;
  } catch {
    console.error("Email change requires a valid APP_BASE_URL");
    return errorResponse("Email changes are temporarily unavailable", 503);
  }
  if (!isTurnstileVerificationValid(captchaResult, "email-change", expectedHostname)) {
    return errorResponse("Security verification failed. Please complete the check again.", 403);
  }

  return NextResponse.json({ verified: true }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withApiTelemetry("/api/account/email", "POST", verifyEmailChange);
