export function withDesmosTheme(
  options: Record<string, boolean> | undefined,
  mode: string | undefined,
): Record<string, boolean> {
  return {
    ...options,
    invertedColors: mode !== "light",
  };
}
