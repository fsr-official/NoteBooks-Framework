import { getDesmosApiScript } from "@/lib/desmos-api";
import { withApiTelemetry } from "@/lib/api-telemetry";

async function getDesmos() {
  return getDesmosApiScript("graphing");
}

export const GET = withApiTelemetry("/api/desmos.js", "GET", getDesmos);
