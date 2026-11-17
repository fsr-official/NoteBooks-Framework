import { NextResponse } from "next/server";
import { getAuthenticatedAccount } from "@/lib/authenticated-account";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

const ACCOUNT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,31}$/;
const GENERATED_ACCOUNT_ID_PATTERN = /^user-[a-f0-9]{12}$/;

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

  const values = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const requestedAccountId = values.accountId;
  const requestedUserName = values.userName;
  if (requestedAccountId === undefined && requestedUserName === undefined) {
    return errorResponse("Provide a User ID or User Name to update", 400);
  }

  const updates: { account_id?: string; user_name?: string } = {};
  if (requestedAccountId !== undefined) {
    if (typeof requestedAccountId !== "string") {
      return errorResponse("A valid User ID is required", 400);
    }
    const accountId = requestedAccountId.trim().toLowerCase();
    if (!ACCOUNT_ID_PATTERN.test(accountId)) {
      return errorResponse("User ID must be 3–32 characters using letters, numbers, underscores, or hyphens", 400);
    }
    if (!GENERATED_ACCOUNT_ID_PATTERN.test(account.accountId)) {
      return errorResponse("Your User ID is permanent and cannot be changed after account setup", 409);
    }
    if (GENERATED_ACCOUNT_ID_PATTERN.test(accountId)) {
      return errorResponse("Choose a custom User ID instead of the temporary generated ID", 400);
    }
    updates.account_id = accountId;
  }

  if (requestedUserName !== undefined) {
    if (typeof requestedUserName !== "string") return errorResponse("A valid User Name is required", 400);
    const userName = requestedUserName.trim();
    if (userName.length < 1 || userName.length > 40) {
      return errorResponse("User Name must contain between 1 and 40 characters", 400);
    }
    updates.user_name = userName;
  }

  let updateQuery = createSupabaseAdminClient()
    .from("accounts")
    .update(updates)
    .eq("auth_user_id", account.user.id);
  if (updates.account_id) updateQuery = updateQuery.eq("account_id", account.accountId);
  const { data, error } = await updateQuery.select("account_id, user_name").maybeSingle();

  if (error) {
    if (error.code === "23505") return errorResponse("That User ID is already taken", 409);
    console.error("Account profile update failed", error);
    return errorResponse("Unable to save your account details", 503);
  }
  if (!data) return errorResponse("Account profile was not found", 404);

  return NextResponse.json(
    { accountId: data.account_id, userName: data.user_name },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const POST = withApiTelemetry("/api/account/profile", "POST", updateProfile);
