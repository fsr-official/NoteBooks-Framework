import { getDesmosApiScript } from "@/lib/desmos-api";
import { withApiTelemetry } from "@/lib/api-telemetry";

async function getDesmos3d() {
  return getDesmosApiScript("3d");
}

export const GET = withApiTelemetry("/api/desmos3d.js", "GET", getDesmos3d);
