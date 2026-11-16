import { NextResponse } from "next/server";
import { getAuthenticatedAccount } from "@/lib/authenticated-account";
import { generateApiKey, hashApiKey } from "@/lib/api-key";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function authenticatedAccount(request: Request) {
  try {
    const account = await getAuthenticatedAccount(request);
    if (!account) return { account: null, response: jsonError("A valid Supabase access token is required", 401) };
    return { account, response: null };
  } catch (error) {
    console.error("API key account authentication failed", error);
    return { account: null, response: jsonError("Unable to verify application account", 503) };
  }
}

async function getKeys(request: Request) {
  const { account, response } = await authenticatedAccount(request);
  if (response) return response;
  if (!account) return jsonError("Account authentication failed", 401);

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, created_at, expires_at, last_used_at, revoked_at")
    .eq("account_id", account.accountId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("API key list query failed", error);
    return jsonError("Unable to list API keys", 503);
  }

  return NextResponse.json(
    { keys: data },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function postKey(request: Request) {
  const { account, response } = await authenticatedAccount(request);
  if (response) return response;
  if (!account) return jsonError("Account authentication failed", 401);

  const body = await request.text();
  if (body.length > 4096) return jsonError("Request body is too large", 413);

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return jsonError("Request body must be valid JSON", 400);
  }

  if (!payload || typeof payload !== "object" || typeof (payload as Record<string, unknown>).name !== "string") {
    return jsonError("A key name is required", 400);
  }
  const name = (payload as { name: string }).name.trim();
  if (name.length < 1 || name.length > 64) {
    return jsonError("Key name must contain 1 to 64 characters", 400);
  }

  const apiKey = generateApiKey();
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("create_api_key", {
    p_auth_user_id: account.user.id,
    p_name: name,
    p_key_hash: hashApiKey(apiKey),
    p_key_prefix: apiKey.slice(0, 12),
  });
  if (error) {
    if (error.message.includes("API_KEY_LIMIT_REACHED")) {
      return jsonError("An account may have at most five active API keys", 409);
    }
    console.error("API key creation failed", error);
    return jsonError("Unable to create API key", 503);
  }
  const created = Array.isArray(data) ? data[0] : null;
  if (!created || typeof created.api_key_id !== "string") {
    console.error("API key creation returned an invalid database result");
    return jsonError("Unable to create API key", 503);
  }

  return NextResponse.json(
    {
      id: created.api_key_id,
      name,
      apiKey,
      warning: "Copy this key now. It cannot be retrieved again.",
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = withApiTelemetry("/api/v1/keys", "GET", getKeys);
export const POST = withApiTelemetry("/api/v1/keys", "POST", postKey);
