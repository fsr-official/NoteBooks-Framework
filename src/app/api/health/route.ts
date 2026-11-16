import { NextResponse } from "next/server";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

function getHealth() {
  return NextResponse.json(
    {
      service: "notebooks-framework-v2",
      status: "ok",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export const GET = withApiTelemetry("/api/health", "GET", getHealth);
