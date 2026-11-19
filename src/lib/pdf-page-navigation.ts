export type PdfPageMode = "single" | "dual";

export function alignPdfPage(page: number, pageCount: number, mode: PdfPageMode): number {
  const boundedPage = Math.min(pageCount, Math.max(1, Math.trunc(page)));
  return mode === "dual" ? Math.floor((boundedPage - 1) / 2) * 2 + 1 : boundedPage;
}

export function getLastPdfSpreadStart(pageCount: number, mode: PdfPageMode): number {
  return mode === "dual" && pageCount % 2 === 0 ? Math.max(1, pageCount - 1) : pageCount;
}
