import { servePublicContent } from "@/lib/public-content-route";

export async function GET(request: Request) {
  return servePublicContent(request, "media");
}

export async function HEAD(request: Request) {
  return servePublicContent(request, "media");
}
