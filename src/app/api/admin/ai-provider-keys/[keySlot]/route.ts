import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-access";
import { isAiProviderKeySlot } from "@/lib/ai-provider-keys";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

async function updateProviderKey(
  request: Request,
  context: { params: Promise<{ keySlot: string }> },
) {
  const { response, account } = await requireAdmin(request);
  if (response) return response;
  if (!account) {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 401 });
  }

  const { keySlot } = await context.params;
  if (!isAiProviderKeySlot(keySlot)) {
    return NextResponse.json({ error: "Unknown AI provider key slot." }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!payload || typeof payload !== "object"
    || typeof (payload as Record<string, unknown>).enabled !== "boolean") {
    return NextResponse.json({ error: "An enabled boolean is required." }, { status: 400 });
  }
  const enabled = (payload as { enabled: boolean }).enabled;

  const { error } = await createSupabaseAdminClient().rpc("set_ai_provider_key_enabled", {
    p_key_slot: keySlot,
    p_enabled: enabled,
    p_updated_by: account.accountId,
  });
  if (error) {
    console.error("Admin AI provider key update failed", { keySlot, enabled, error });
    return NextResponse.json({ error: "Unable to update AI provider key status." }, { status: 503 });
  }

  try {
    await recordAdminAuditEvent({
      accountId: account.accountId,
      action: enabled ? "ai.provider-key.enable" : "ai.provider-key.disable",
      resource: `groq:${keySlot}`,
      details: { enabled, keySlot },
    });
  } catch (auditError) {
    console.error("Admin AI provider key audit event failed", { keySlot, enabled, auditError });
    return NextResponse.json({ error: "Key status changed but the administrative action could not be audited." }, { status: 503 });
  }

  return NextResponse.json({ keySlot, enabled }, { headers: { "Cache-Control": "no-store" } });
}

export const PATCH = withApiTelemetry(
  "/api/admin/ai-provider-keys/[keySlot]",
  "PATCH",
  updateProviderKey,
);
