import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-access";
import {
  AI_PROVIDER_KEY_SLOTS,
  isAiProviderKeySlot,
} from "@/lib/ai-provider-keys";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

type ProviderKeySnapshot = {
  keySlot: string;
  enabled: boolean;
  cooldownUntil: string | null;
  cooldownActive: boolean;
  lastRateLimitedAt: string | null;
  requests24h: number;
  promptTokens24h: number;
  completionTokens24h: number;
  rateLimited24h: number;
  requests30d: number;
  promptTokens30d: number;
  completionTokens30d: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isTimestampOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value)));
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function readSnapshot(value: unknown): ProviderKeySnapshot | null {
  if (!isRecord(value)
    || !isAiProviderKeySlot(value.keySlot)
    || typeof value.enabled !== "boolean"
    || !isTimestampOrNull(value.cooldownUntil)
    || !isTimestampOrNull(value.lastRateLimitedAt)
    || !isCount(value.requests24h)
    || !isCount(value.promptTokens24h)
    || !isCount(value.completionTokens24h)
    || !isCount(value.rateLimited24h)
    || !isCount(value.requests30d)
    || !isCount(value.promptTokens30d)
    || !isCount(value.completionTokens30d)) return null;
  return value as ProviderKeySnapshot;
}

async function getProviderKeys(request: Request) {
  const { response } = await requireAdmin(request);
  if (response) return response;

  const { data, error } = await createSupabaseAdminClient().rpc("get_ai_provider_key_dashboard");
  if (error) {
    console.error("Admin AI provider key dashboard query failed", error);
    return NextResponse.json({ error: "Unable to load AI provider key status; apply the AI provider key administration migration." }, { status: 503 });
  }
  if (!Array.isArray(data)) {
    console.error("Admin AI provider key dashboard returned an invalid response");
    return NextResponse.json({ error: "Unable to load AI provider key status." }, { status: 503 });
  }

  const snapshots = data.map(readSnapshot);
  if (snapshots.some((snapshot) => snapshot === null)) {
    console.error("Admin AI provider key dashboard contains invalid data");
    return NextResponse.json({ error: "Unable to load AI provider key status." }, { status: 503 });
  }
  const snapshotBySlot = new Map(
    snapshots.flatMap((snapshot) => snapshot ? [[snapshot.keySlot, snapshot] as const] : []),
  );
  if (AI_PROVIDER_KEY_SLOTS.some(({ slot }) => !snapshotBySlot.has(slot))) {
    console.error("Admin AI provider key dashboard is missing a provider slot");
    return NextResponse.json({ error: "Unable to load AI provider key status." }, { status: 503 });
  }

  const keys = AI_PROVIDER_KEY_SLOTS.map(({ slot, environmentVariable }) => ({
    ...snapshotBySlot.get(slot),
    keySlot: slot,
    cooldownActive: snapshotBySlot.get(slot)?.cooldownUntil !== null
      && Date.parse(snapshotBySlot.get(slot)?.cooldownUntil ?? "") > Date.now(),
    configured: Boolean(process.env[environmentVariable]?.trim()),
  }));
  return NextResponse.json({ keys }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withApiTelemetry("/api/admin/ai-provider-keys", "GET", getProviderKeys);
