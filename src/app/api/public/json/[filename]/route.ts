import { NextResponse } from "next/server";
import { getPublicIndexName } from "@/lib/public-indexes";
import { readPublicIndex } from "@/lib/public-index-cache";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ filename: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { filename } = await context.params;
  if (filename === "classnine-tree.json" || filename === "classten-tree.json") {
    return NextResponse.redirect(new URL("/api/public/json/lowersecondary-tree.json", request.url), 308);
  }
  const index = getPublicIndexName(filename);
  if (!index) {
    return NextResponse.json({ error: "Public index not found" }, { status: 404 });
  }

  try {
    const document = await readPublicIndex(index.name, index.format);
    if (document === null) {
      return NextResponse.json(
        { error: "Public index has not been generated yet" },
        { status: 503, headers: { "Retry-After": "30" } },
      );
    }
    return new Response(document, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        "Content-Type": index.format === "json"
          ? "application/json; charset=utf-8"
          : "application/x-ndjson; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Public index retrieval failed", error);
    return NextResponse.json({ error: "Unable to retrieve public index" }, { status: 503 });
  }
}
