import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRedisClient } from "@/lib/public-index-cache";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

async function getOverview(request: Request) {
  const { response } = await requireAdmin(request);
  if (response) return response;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("get_admin_dashboard_snapshot");
  if (error) {
    console.error("Admin dashboard snapshot query failed", error);
    return NextResponse.json({ error: "Unable to load dashboard data; apply the admin dashboard migration" }, { status: 503 });
  }

  let redisStatus: "healthy" | "unavailable" = "healthy";
  try {
    const ping = await getRedisClient().ping();
    if (ping !== "PONG") redisStatus = "unavailable";
  } catch (redisError) {
    redisStatus = "unavailable";
    console.error("Admin dashboard Redis health check failed", redisError);
  }

  const configured = {
    database: "healthy" as const,
    redis: redisStatus,
    github: process.env.GITHUB_TOKEN || process.env.GITHUB_PAT ? "configured" as const : "missing" as const,
    qstash: process.env.QSTASH_TOKEN
      && process.env.QSTASH_CURRENT_SIGNING_KEY
      && process.env.QSTASH_NEXT_SIGNING_KEY
      && process.env.APP_BASE_URL
      ? "configured" as const
      : "missing" as const,
  };
  return NextResponse.json({
    ...data as Record<string, unknown>,
    services: configured,
    observedAt: new Date().toISOString(),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export const GET = withApiTelemetry("/api/admin/overview", "GET", getOverview);
