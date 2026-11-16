import { NextResponse } from "next/server";
import { getAuthenticatedAccount } from "@/lib/authenticated-account";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,31}$/;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function updateProfile(request: Request) {
  let account;
  try {
    account = await getAuthenticatedAccount(request);
  } catch (error) {
    console.error("Account profile verification failed", error);
    return errorResponse("Unable to verify your account", 503);
  }
  if (!account) return errorResponse("A valid sign-in is required", 401);

  const body = await request.text();
  if (body.length > 2048) return errorResponse("Request body is too large", 413);

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return errorResponse("Request body must be valid JSON", 400);
  }

  const requestedAccountId = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>).accountId
    : null;
  if (typeof requestedAccountId !== "string") {
    return errorResponse("A valid username is required", 400);
  }
  const accountId = requestedAccountId.trim().toLowerCase();
  if (!ACCOUNT_ID_PATTERN.test(accountId)) {
    return errorResponse("Username must be 3–32 characters using letters, numbers, underscores, or hyphens", 400);
  }

  const { data, error } = await createSupabaseAdminClient()
    .from("accounts")
    .update({ account_id: accountId })
    .eq("auth_user_id", account.user.id)
    .select("account_id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return errorResponse("That username is already taken", 409);
    console.error("Account profile update failed", error);
    return errorResponse("Unable to save your username", 503);
  }
  if (!data) return errorResponse("Account profile was not found", 404);

  return NextResponse.json(
    { accountId: data.account_id },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const POST = withApiTelemetry("/api/account/profile", "POST", updateProfile);
