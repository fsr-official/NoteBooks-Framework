import { NextResponse } from "next/server";
import { enqueueRepositoryUpdate } from "@/lib/qstash";
import { verifyWebhookSignature } from "@/lib/webhook-signature";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

interface UpdateRequest {
  repository: string;
  branch: string;
}

function isUpdateRequest(value: unknown): value is UpdateRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return typeof request.repository === "string"
    && /^[\w.-]+\/[\w.-]+$/.test(request.repository)
    && request.repository.length <= 200
    && typeof request.branch === "string"
    && request.branch.trim().length > 0
    && request.branch.length <= 200;
}

async function postRepositoryUpdate(request: Request) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4096) {
    return NextResponse.json({ error: "Webhook request is too large" }, { status: 413 });
  }
  const body = await request.text();
  if (body.length > 4096) {
    return NextResponse.json({ error: "Webhook request is too large" }, { status: 413 });
  }
  if (!verifyWebhookSignature(body, request.headers.get("x-notebooks-signature"), secret)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (!isUpdateRequest(payload)) {
    return NextResponse.json({ error: "Expected repository and branch strings" }, { status: 400 });
  }

  try {
    const messageId = await enqueueRepositoryUpdate(payload);
    return NextResponse.json(
      { repository: payload.repository, status: "queued", messageId },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Unable to enqueue repository update", error);
    return NextResponse.json({ error: "Repository update could not be queued" }, { status: 503 });
  }
}

export const POST = withApiTelemetry(
  "/api/webhooks/repository-update",
  "POST",
  postRepositoryUpdate,
);
