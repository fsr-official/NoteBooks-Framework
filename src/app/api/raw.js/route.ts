import { servePublicContent } from "@/lib/public-content-route";
import { withApiTelemetry } from "@/lib/api-telemetry";

async function getRawAlias(request: Request) {
  return servePublicContent(request, "markdown");
}

async function headRawAlias(request: Request) {
  return servePublicContent(request, "markdown");
}

export const GET = withApiTelemetry("/api/raw.js", "GET", getRawAlias);
export const HEAD = withApiTelemetry("/api/raw.js", "HEAD", headRawAlias);
