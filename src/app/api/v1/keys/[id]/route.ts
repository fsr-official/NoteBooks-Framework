import { NextResponse } from "next/server";
import { getAuthenticatedAccount } from "@/lib/authenticated-account";
import { isValidApiKeyId } from "@/lib/api-key";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function deleteKey(request: Request, context: RouteContext) {
  let account;
  try {
    account = await getAuthenticatedAccount(request);
  } catch (error) {
    console.error("API key account authentication failed", error);
    return NextResponse.json({ error: "Unable to verify application account" }, { status: 503 });
  }

  if (!account) {
    return NextResponse.json(
      { error: "A valid Supabase access token is required" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { id } = await context.params;
  if (!isValidApiKeyId(id)) {
    return NextResponse.json({ error: "Invalid API key ID" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("account_id", account.accountId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("API key revocation failed", error);
    return NextResponse.json({ error: "Unable to revoke API key" }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: "Active API key not found" }, { status: 404 });

  return NextResponse.json(
    { id: data.id, status: "revoked" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const DELETE = withApiTelemetry("/api/v1/keys/:id", "DELETE", deleteKey);
