import { NextResponse } from "next/server";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-access";
import { parseAdminRepositoryInput } from "@/lib/admin-repository-input";
import { rebuildAdminRepositoryIndexes } from "@/lib/admin-repository-index";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function patchRepository(request: Request, context: RouteContext) {
  const { account, response } = await requireAdmin(request);
  if (response) return response;

  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
    return errorResponse("Invalid repository ID", 400);
  }
  const body = await request.text();
  if (body.length > 16_384) return errorResponse("Request body is too large", 413);
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return errorResponse("Request body must be valid JSON", 400);
  }
  const values = parseAdminRepositoryInput(payload, { partial: true });
  if (!values) return errorResponse("Repository configuration is invalid", 400);

  const { data, error } = await createSupabaseAdminClient()
    .from("repository_entries")
    .update(values)
    .eq("id", id)
    .eq("record_type", "repository")
    .select("id, account_id, repo_owner, repo_name")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return errorResponse("Repository name or URL is already in use", 409);
    if (error.code === "23503") return errorResponse("The responsible account ID does not exist", 400);
    console.error("Admin repository update failed", error);
    return errorResponse("Unable to update repository record", 503);
  }
  if (!data) return errorResponse("Repository not found", 404);

  try {
    await recordAdminAuditEvent({
      accountId: account!.accountId,
      action: "repository.update",
      resource: `${data.repo_owner}/${data.repo_name}`,
      details: { fields: Object.keys(values).sort().join(",") },
    });
  } catch (auditError) {
    console.error("Repository was updated but audit logging failed", auditError);
    return errorResponse("Repository was saved, but its audit event could not be recorded", 503);
  }
  try {
    await rebuildAdminRepositoryIndexes();
  } catch (indexError) {
    console.error("Repository was updated but index refresh failed", indexError);
    return errorResponse("Repository was saved, but the public indexes could not be rebuilt", 503);
  }
  return NextResponse.json({ repository: data }, { headers: { "Cache-Control": "no-store" } });
}

async function archiveRepository(request: Request, context: RouteContext) {
  const { account, response } = await requireAdmin(request);
  if (response) return response;

  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
    return errorResponse("Invalid repository ID", 400);
  }
  const { data, error } = await createSupabaseAdminClient()
    .from("repository_entries")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("record_type", "repository")
    .is("archived_at", null)
    .select("id, repo_owner, repo_name")
    .maybeSingle();
  if (error) {
    console.error("Admin repository archive failed", error);
    return errorResponse("Unable to archive repository", 503);
  }
  if (!data) return errorResponse("Active repository not found", 404);

  try {
    await recordAdminAuditEvent({
      accountId: account!.accountId,
      action: "repository.archive",
      resource: `${data.repo_owner}/${data.repo_name}`,
    });
  } catch (auditError) {
    console.error("Repository was archived but audit logging failed", auditError);
    return errorResponse("Repository was archived, but its audit event could not be recorded", 503);
  }
  try {
    await rebuildAdminRepositoryIndexes();
  } catch (indexError) {
    console.error("Repository was archived but index refresh failed", indexError);
    return errorResponse("Repository was archived, but the public indexes could not be rebuilt", 503);
  }
  return NextResponse.json({ id: data.id, status: "archived" }, { headers: { "Cache-Control": "no-store" } });
}

async function restoreRepository(request: Request, context: RouteContext) {
  const { account, response } = await requireAdmin(request);
  if (response) return response;

  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
    return errorResponse("Invalid repository ID", 400);
  }
  const { data, error } = await createSupabaseAdminClient()
    .from("repository_entries")
    .update({ archived_at: null })
    .eq("id", id)
    .eq("record_type", "repository")
    .not("archived_at", "is", null)
    .select("id, repo_owner, repo_name")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return errorResponse("An active repository with this name or URL already exists", 409);
    console.error("Admin repository restore failed", error);
    return errorResponse("Unable to restore repository", 503);
  }
  if (!data) return errorResponse("Archived repository not found", 404);

  try {
    await recordAdminAuditEvent({
      accountId: account!.accountId,
      action: "repository.restore",
      resource: `${data.repo_owner}/${data.repo_name}`,
    });
  } catch (auditError) {
    console.error("Repository was restored but audit logging failed", auditError);
    return errorResponse("Repository was restored, but its audit event could not be recorded", 503);
  }
  try {
    await rebuildAdminRepositoryIndexes();
  } catch (indexError) {
    console.error("Repository was restored but index refresh failed", indexError);
    return errorResponse("Repository was restored, but the public indexes could not be rebuilt", 503);
  }
  return NextResponse.json({ id: data.id, status: "restored" }, { headers: { "Cache-Control": "no-store" } });
}

export const PATCH = withApiTelemetry("/api/admin/repositories/:id", "PATCH", patchRepository);
export const DELETE = withApiTelemetry("/api/admin/repositories/:id", "DELETE", archiveRepository);
export const POST = withApiTelemetry("/api/admin/repositories/:id", "POST", restoreRepository);
