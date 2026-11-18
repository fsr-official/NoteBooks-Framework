import { NextResponse } from "next/server";
import { getAuthenticatedAccount } from "@/lib/authenticated-account";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

async function getAiUsage(request: Request) {
  let account;
  try {
    account = await getAuthenticatedAccount(request);
  } catch (error) {
    console.error("AI usage account verification failed", error);
    return NextResponse.json({ error: "Unable to verify your account." }, { status: 503 });
  }
  if (!account) {
    return NextResponse.json({ error: "A valid sign-in is required." }, { status: 401 });
  }

  try {
    const { data, error } = await createSupabaseAdminClient()
      .rpc("get_ai_usage_summary", { p_account_id: account.accountId });
    if (error) throw error;
    const summary = Array.isArray(data) ? data[0] : null;
    if (!summary) {
      return NextResponse.json({ error: "AI usage is temporarily unavailable." }, { status: 503 });
    }
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("AI usage summary could not be loaded", error);
    return NextResponse.json({ error: "AI usage is temporarily unavailable." }, { status: 503 });
  }
}

export const GET = withApiTelemetry("/api/account/ai-usage", "GET", getAiUsage);
