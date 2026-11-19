import { NextResponse } from "next/server";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-access";
import { parseAdminRepositoryInput } from "@/lib/admin-repository-input";
import { rebuildAdminRepositoryIndexes } from "@/lib/admin-repository-index";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

const REPOSITORY_COLUMNS = [
  "id", "account_id", "registry_name", "repo_owner", "repo_name", "branch", "class_or_stream",
  "root", "enabled", "empty", "lfs", "pages", "fallback", "priority",
  "last_commit_sha", "last_checked_at", "last_updated_at", "archived_at",
].join(", ");

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function getRepositories(request: Request) {
  const { response } = await requireAdmin(request);
  if (response) return response;

  const { data, error } = await createSupabaseAdminClient()
    .from("repository_entries")
    .select(REPOSITORY_COLUMNS)
    .eq("record_type", "repository")
    .order("repo_owner")
    .order("repo_name");
  if (error) {
    console.error("Admin repository list query failed", error);
    return errorResponse("Unable to load repository records", 503);
  }
  return NextResponse.json({ repositories: data }, { headers: { "Cache-Control": "no-store" } });
}

async function postRepository(request: Request) {
  const { account, response } = await requireAdmin(request);
  if (response) return response;

  const body = await request.text();
  if (body.length > 16_384) return errorResponse("Request body is too large", 413);
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return errorResponse("Request body must be valid JSON", 400);
  }
  const values = parseAdminRepositoryInput(payload);
  if (!values) return errorResponse("Repository configuration is invalid", 400);

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("repository_entries")
    .insert({
      ...values,
      account_id: values.account_id ?? null,
      archived_at: null,
      last_commit_sha: null,
      last_updated_at: null,
      record_type: "repository",
    })
    .select(REPOSITORY_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") return errorResponse("A repository with this name or URL already exists", 409);
    if (error.code === "23503") return errorResponse("The responsible account ID does not exist", 400);
    console.error("Admin repository creation failed", error);
    return errorResponse("Unable to create repository record", 503);
  }

  try {
    await recordAdminAuditEvent({
      accountId: account!.accountId,
      action: "repository.create",
      resource: `${values.repo_owner}/${values.repo_name}`,
    });
  } catch (auditError) {
    console.error("Repository was created but audit logging failed", auditError);
    return NextResponse.json(
      { error: "Repository was saved, but its audit event could not be recorded", repository: data },
      { status: 503 },
    );
  }
  try {
    await rebuildAdminRepositoryIndexes();
  } catch (indexError) {
    console.error("Repository was created but index refresh failed", indexError);
    return NextResponse.json(
      { error: "Repository was saved, but the public indexes could not be rebuilt", repository: data },
      { status: 503 },
    );
  }
  return NextResponse.json({ repository: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export const GET = withApiTelemetry("/api/admin/repositories", "GET", getRepositories);
export const POST = withApiTelemetry("/api/admin/repositories", "POST", postRepository);
