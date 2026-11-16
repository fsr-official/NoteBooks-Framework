import { NextResponse } from "next/server";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-access";
import { rebuildAdminRepositoryIndexes } from "@/lib/admin-repository-index";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

async function postRebuild(request: Request) {
  const { account, response } = await requireAdmin(request);
  if (response) return response;

  try {
    await rebuildAdminRepositoryIndexes();
  } catch (error) {
    console.error("Admin requested public index rebuild failed", error);
    return NextResponse.json({ error: "Unable to rebuild public indexes" }, { status: 503 });
  }
  try {
    await recordAdminAuditEvent({
      accountId: account!.accountId,
      action: "indexes.rebuild",
      resource: "all-public-indexes",
    });
  } catch (error) {
    console.error("Public indexes were rebuilt but the audit event could not be recorded", error);
    return NextResponse.json({ error: "Indexes were rebuilt, but audit logging failed" }, { status: 503 });
  }
  return NextResponse.json({ status: "rebuilt" }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withApiTelemetry("/api/admin/indexes/rebuild", "POST", postRebuild);
