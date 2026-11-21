const BUNDLE_SOURCE = /^research-and-development\/src\/([^/]+)\/([^/]+)-NOTES\.mdx$/i;

function normalizeChapterId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function precompiledChapterId(
  owner: string,
  repository: string,
  filePath: string,
): string | null {
  if (owner.toLowerCase() !== "fsr-official" || repository.toLowerCase() !== "notebooks-developers") {
    return null;
  }
  const match = filePath.match(BUNDLE_SOURCE);
  if (!match) return null;
  const [directoryId, fileId] = match.slice(1);
  const normalizedDirectoryId = normalizeChapterId(directoryId);
  const normalizedFileId = normalizeChapterId(fileId);
  return normalizedDirectoryId && normalizedDirectoryId === normalizedFileId
    ? normalizedDirectoryId
    : null;
}
