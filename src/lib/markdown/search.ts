export function createWildcardMatcher(query: string): RegExp | null {
  if (!query || !/[^*?]/.test(query)) return null;
  const pattern = query.split("").map((character) => {
    if (character === "*") return ".*";
    if (character === "?") return ".";
    return character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  }).join("");
  return new RegExp(pattern, "i");
}
