import { NextResponse } from "next/server";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-access";
import { queueRepositoryUpdates } from "@/lib/repository-update-queue";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

interface Repository {
  id: string;
  branch: string;
  repo_name: string;
  repo_owner: string;
}

async function postSync(request: Request) {
  const { account, response } = await requireAdmin(request);
  if (response) return response;

  const body = await request.text();
  if (body.length > 2048) return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  let repoId: string | null = null;
  if (body.trim()) {
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    if (!payload || typeof payload !== "object"
        || (Object.hasOwn(payload, "repoId") && typeof (payload as Record<string, unknown>).repoId !== "string")) {
      return NextResponse.json({ error: "Invalid repository selection" }, { status: 400 });
    }
    repoId = typeof (payload as Record<string, unknown>).repoId === "string"
      ? (payload as Record<string, string>).repoId
      : null;
    if (repoId && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(repoId)) {
      return NextResponse.json({ error: "Invalid repository ID" }, { status: 400 });
    }
  }

  let query = createSupabaseAdminClient()
    .from("repository_entries")
    .select("id, branch, repo_name, repo_owner")
    .eq("record_type", "repository")
    .eq("enabled", true)
    .is("archived_at", null)
    .order("repo_owner")
    .order("repo_name");
  if (repoId) query = query.eq("id", repoId);
  const { data, error } = await query;
  if (error) {
    console.error("Admin repository sync lookup failed", error);
    return NextResponse.json({ error: "Unable to load repositories for checking" }, { status: 503 });
  }
  const repositories = (data ?? []) as Repository[];
  if (repoId && repositories.length === 0) {
    return NextResponse.json({ error: "Enabled repository not found" }, { status: 404 });
  }
  if (repositories.length === 0) {
    return NextResponse.json({ queued: 0, failed: [], status: "no-enabled-repositories" }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const results = await queueRepositoryUpdates(repositories, account!.accountId);

  const queued = results.filter((result) => result.status === "queued").length;
  const failed = results.filter((result) => result.status === "failed").map(({ repository }) => repository);
  try {
    await recordAdminAuditEvent({
      accountId: account!.accountId,
      action: "repository.sync.request",
      resource: repoId ? results[0]?.repository ?? repoId : "all-enabled-repositories",
      details: { queued, failed: failed.length },
    });
  } catch (auditError) {
    console.error("Repository checks were queued but audit logging failed", auditError);
    return NextResponse.json({ error: "Checks were queued, but audit logging failed", queued, failed }, { status: 503 });
  }

  return NextResponse.json({
    queued,
    failed,
    status: queued > 0 ? "queued" : "failed",
  }, {
    status: queued > 0 ? 202 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

export const POST = withApiTelemetry("/api/admin/repositories/sync", "POST", postSync);
