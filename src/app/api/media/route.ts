import { servePublicContent } from "@/lib/public-content-route";
import { withApiTelemetry } from "@/lib/api-telemetry";

async function getMedia(request: Request) {
  return servePublicContent(request, "media");
}

async function headMedia(request: Request) {
  return servePublicContent(request, "media");
}

export const GET = withApiTelemetry("/api/media", "GET", getMedia);
export const HEAD = withApiTelemetry("/api/media", "HEAD", headMedia);
