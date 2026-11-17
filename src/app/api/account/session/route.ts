import { NextResponse } from "next/server";
import type { UserIdentity } from "@supabase/supabase-js";
import { getAuthenticatedAccount } from "@/lib/authenticated-account";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

const SESSION_ID_PATTERN = /^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i;
const GENERATED_ACCOUNT_ID_PATTERN = /^user-[a-f0-9]{12}$/;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function metadataString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function githubProfile(identities: UserIdentity[] | undefined, metadata: Record<string, unknown>) {
  const identity = identities?.find((item) => item.provider === "github");
  if (!identity) return null;

  const identityData = identity.identity_data ?? {};
  const githubUsername = metadataString(identityData.user_name)
    ?? metadataString(identityData.login)
    ?? metadataString(identityData.preferred_username)
    ?? metadataString(metadata.user_name)
    ?? metadataString(metadata.preferred_username);
  const githubUserId = metadataString(identityData.sub)
    ?? metadataString(identityData.provider_id)
    ?? metadataString(identity.id);

  return { githubUserId, githubUsername };
}

async function bindAccountSession(request: Request) {
  let account;
  try {
    account = await getAuthenticatedAccount(request);
  } catch (error) {
    console.error("Account session verification failed", error);
    return errorResponse("Unable to verify your account", 503);
  }
  if (!account) return errorResponse("A valid sign-in is required", 401);

  const body = await request.text();
  if (body.length > 1024) return errorResponse("Request body is too large", 413);

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return errorResponse("Request body must be valid JSON", 400);
  }

  const sessionId = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>).sessionId
    : null;
  if (typeof sessionId !== "string" || !SESSION_ID_PATTERN.test(sessionId)) {
    return errorResponse("A valid browser session ID is required", 400);
  }

  const profile = githubProfile(account.user.identities, account.user.user_metadata);
  const supabase = createSupabaseAdminClient();
  const needsSetup = GENERATED_ACCOUNT_ID_PATTERN.test(account.accountId);
  let userName = account.userName;

  if (profile?.githubUserId) {
    const profileUpdates: {
      github_user_id: string;
      github_username: string | null;
      user_name?: string;
    } = {
      github_user_id: profile.githubUserId,
      github_username: profile.githubUsername,
    };
    if (needsSetup && profile.githubUsername) {
      profileUpdates.user_name = profile.githubUsername;
      userName = profile.githubUsername;
    }
    const { error: profileError } = await supabase
      .from("accounts")
      .update(profileUpdates)
      .eq("auth_user_id", account.user.id);
    if (profileError) {
      if (profileError.code === "23505") {
        return errorResponse("This GitHub account is already linked to another NoteBooks account", 409);
      }
      console.error("GitHub account identity update failed", profileError);
      return errorResponse("Unable to save your GitHub account identity", 503);
    }
  }

  const { error: bindingError } = await supabase
    .from("account_sessions")
    .upsert(
      { session_id: sessionId, auth_user_id: account.user.id },
      { onConflict: "session_id" },
    );
  if (bindingError) {
    console.error("Account session binding failed", bindingError);
    return errorResponse("Unable to link this browser session to your account", 503);
  }

  return NextResponse.json({
    authUserId: account.user.id,
    userId: account.accountId,
    userName,
    githubUserId: profile?.githubUserId ?? null,
    githubUsername: profile?.githubUsername ?? null,
    needsSetup,
  }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withApiTelemetry("/api/account/session", "POST", bindAccountSession);
