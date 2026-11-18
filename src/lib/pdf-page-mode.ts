import type { PdfPageMode } from "@/lib/pdf-page-navigation";

export function resolvePdfPageMode(preferred: PdfPageMode, viewportWidth: number): PdfPageMode {
  return preferred === "single" || viewportWidth <= 760 ? "single" : "dual";
}
