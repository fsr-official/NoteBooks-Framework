import { servePublicContent } from "@/lib/public-content-route";
import { withApiTelemetry } from "@/lib/api-telemetry";

async function getRaw(request: Request) {
  return servePublicContent(request, "markdown");
}

async function headRaw(request: Request) {
  return servePublicContent(request, "markdown");
}

export const GET = withApiTelemetry("/api/raw", "GET", getRaw);
export const HEAD = withApiTelemetry("/api/raw", "HEAD", headRaw);
