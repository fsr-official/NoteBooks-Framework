import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { queueRepositoryUpdates } from "@/lib/repository-update-queue";
import { isRepositoryUpdateIdentity } from "@/lib/repository-update-identity";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

interface Repository {
  branch: string;
  repo_name: string;
  repo_owner: string;
}

function matchesReconciliationSecret(candidate: string, expected: string): boolean {
  if (candidate.length > 1024 || Buffer.byteLength(expected, "utf8") < 32) return false;
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

async function postReconciliation(request: Request) {
  const expectedSecret = process.env.REPOSITORY_RECONCILIATION_SECRET;
  if (!expectedSecret || Buffer.byteLength(expectedSecret, "utf8") < 32) {
    return NextResponse.json({ error: "Repository reconciliation is not configured" }, { status: 503 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(authorization);
  if (!match || !matchesReconciliationSecret(match[1], expectedSecret)) {
    return NextResponse.json({ error: "Invalid repository reconciliation credentials" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1024) {
    return NextResponse.json({ error: "Reconciliation request is too large" }, { status: 413 });
  }
  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > 1024) {
      return NextResponse.json({ error: "Reconciliation request is too large" }, { status: 413 });
    }
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Reconciliation run identity must be valid JSON" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid reconciliation run identity" }, { status: 400 });
  }
  const run = payload as Record<string, unknown>;
  const identity = {
    source: "reconciliation",
    runId: run.runId,
    runAttempt: run.runAttempt,
  } as const;
  if (!isRepositoryUpdateIdentity(identity)) {
    return NextResponse.json({ error: "Invalid reconciliation run identity" }, { status: 400 });
  }

  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("repository_entries")
      .select("branch, repo_name, repo_owner")
      .eq("record_type", "repository")
      .eq("enabled", true)
      .is("archived_at", null)
      .order("repo_owner")
      .order("repo_name");
    if (error) throw error;

    const repositories = (data ?? []) as Repository[];
    const results = await queueRepositoryUpdates(repositories, undefined, identity);
    const failed = results
      .filter((result) => result.status === "failed")
      .map((result) => result.repository);
    const queued = results.length - failed.length;

    return NextResponse.json({
      checked: repositories.length,
      queued,
      failed,
      status: failed.length ? "partial" : queued ? "queued" : "no-enabled-repositories",
    }, {
      status: failed.length ? 503 : queued ? 202 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Scheduled repository reconciliation failed", error);
    return NextResponse.json({ error: "Unable to queue repository reconciliation" }, { status: 503 });
  }
}

export const POST = withApiTelemetry(
  "/api/cron/repository-reconciliation",
  "POST",
  postReconciliation,
);
