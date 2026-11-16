import { servePublicContent } from "@/lib/public-content-route";
import { withApiTelemetry } from "@/lib/api-telemetry";

async function getMediaAlias(request: Request) {
  return servePublicContent(request, "media");
}

async function headMediaAlias(request: Request) {
  return servePublicContent(request, "media");
}

export const GET = withApiTelemetry("/api/media.js", "GET", getMediaAlias);
export const HEAD = withApiTelemetry("/api/media.js", "HEAD", headMediaAlias);
