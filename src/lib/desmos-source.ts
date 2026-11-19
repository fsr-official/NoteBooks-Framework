export function isLegacyDesmosJsonLine(line: string): boolean {
  return /^\s*\{?\s*"?\b(?:expressions|options|settings|id|type|latex)"?\s*:/i.test(line);
}

export function formatDesmosDiagnostic(
  source: string,
  diagnostic: { line: number; col: number; code: string; message: string },
): string {
  const sourceLine = source.replace(/\r\n?/g, "\n").split("\n")[diagnostic.line - 1] ?? "";
  const column = Math.max(1, diagnostic.col);
  const contextStart = Math.max(0, column - 81);
  const contextEnd = Math.min(sourceLine.length, contextStart + 240);
  const prefix = contextStart > 0 ? "…" : "";
  const suffix = contextEnd < sourceLine.length ? "…" : "";
  const excerpt = `${prefix}${sourceLine.slice(contextStart, contextEnd)}${suffix}`;
  const caret = `${" ".repeat(column - 1 - contextStart + prefix.length)}^`;

  return `${diagnostic.code} · line ${diagnostic.line}, column ${column}: ${diagnostic.message}\n${excerpt}\n${caret}`;
}
