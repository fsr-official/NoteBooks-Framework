import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

const PUBLIC_ROUTES = new Set([
  "/",
  "/lowersecondary",
  "/science",
  "/commerce",
  "/humanities",
  "/developers",
]);

async function postPageView(request: Request) {
  const body = await request.text();
  if (body.length > 1024) return NextResponse.json({ error: "Request body is too large" }, { status: 413 });

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const route = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>).route
    : null;
  if (typeof route !== "string" || !PUBLIC_ROUTES.has(route)) {
    return NextResponse.json({ error: "Invalid page route" }, { status: 400 });
  }

  const { error } = await createSupabaseAdminClient().rpc("record_website_page_view", { p_route: route });
  if (error) {
    console.error("Website page view metric write failed", error);
    return NextResponse.json({ error: "Unable to record page view" }, { status: 503 });
  }
  return new Response(null, { status: 204 });
}

export const POST = withApiTelemetry("/api/telemetry/page-view", "POST", postPageView);
