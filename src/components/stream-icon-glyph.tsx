import type { LibraryId } from "@/lib/library-streams";

export function StreamIconGlyph({ stream, fallback }: { stream: LibraryId; fallback: string }) {
  if (stream === "developer") {
    return (
      <svg className="corporal-rank-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 16.5 12 21l7-4.5" />
        <path d="M5 11.5 12 16l7-4.5" />
      </svg>
    );
  }
  return <>{fallback}</>;
}
