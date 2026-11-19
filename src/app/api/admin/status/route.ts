import { NextResponse } from "next/server";
import { getAuthenticatedAccount } from "@/lib/authenticated-account";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

async function getStatus(request: Request) {
  let account;
  try {
    account = await getAuthenticatedAccount(request);
  } catch (error) {
    console.error("Admin status account lookup failed", error);
    return NextResponse.json({ error: "Unable to verify application account" }, { status: 503 });
  }
  if (!account) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }

  let administrator;
  let error;
  try {
    ({ data: administrator, error } = await createSupabaseAdminClient()
      .from("accounts")
      .select("account_id")
      .eq("role", "admin")
      .maybeSingle());
  } catch (lookupError) {
    console.error("Admin status lookup failed", lookupError);
    return NextResponse.json({ error: "Unable to check administrator setup" }, { status: 503 });
  }
  if (error) {
    console.error("Admin status lookup failed", error);
    return NextResponse.json({ error: "Unable to check administrator setup" }, { status: 503 });
  }

  return NextResponse.json({
    isAdmin: account.role === "admin",
    hasAdministrator: Boolean(administrator),
    bootstrapAvailable: !administrator && Boolean(process.env.ADMIN_BOOTSTRAP_TOKEN),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export const GET = withApiTelemetry("/api/admin/status", "GET", getStatus);
