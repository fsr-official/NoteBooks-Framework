import { NextResponse } from "next/server";
import { processRepositoryUpdate } from "../../../../../workflow/repository-update";
import { verifyQstashRequest } from "@/lib/qstash";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

interface RepositoryUpdateJob {
  repository: string;
  branch: string;
  requestedBy?: string;
}

function isRepositoryUpdateJob(value: unknown): value is RepositoryUpdateJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Record<string, unknown>;
  return typeof job.repository === "string"
    && /^[\w.-]+\/[\w.-]+$/.test(job.repository)
    && job.repository.length <= 200
    && typeof job.branch === "string"
    && job.branch.trim().length > 0
    && job.branch.length <= 200
    && (job.requestedBy === undefined
      || (typeof job.requestedBy === "string" && /^[a-z0-9][a-z0-9_-]{2,31}$/.test(job.requestedBy)));
}

async function postRepositoryWorker(request: Request) {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey || !process.env.APP_BASE_URL) {
    return NextResponse.json({ error: "QStash worker is not configured" }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4096) {
    return NextResponse.json({ error: "QStash request is too large" }, { status: 413 });
  }
  const body = await request.text();
  if (body.length > 4096) {
    return NextResponse.json({ error: "QStash request is too large" }, { status: 413 });
  }

  try {
    const verified = await verifyQstashRequest(body, request.headers.get("upstash-signature"));
    if (!verified) return NextResponse.json({ error: "Invalid QStash signature" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Invalid QStash signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "QStash body must be valid JSON" }, { status: 400 });
  }
  if (!isRepositoryUpdateJob(payload)) {
    return NextResponse.json({ error: "Invalid repository update job" }, { status: 400 });
  }

  try {
    const result = await processRepositoryUpdate(payload);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("QStash repository update failed", error);
    return NextResponse.json({ error: "Repository update processing failed" }, { status: 500 });
  }
}

export const POST = withApiTelemetry(
  "/api/workflows/repository-update",
  "POST",
  postRepositoryWorker,
);
