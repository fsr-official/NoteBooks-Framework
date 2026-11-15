export interface ExplorerFile {
  fileName: string;
  filePath: string;
  repository: string;
}

export type ExplorerEntry =
  | { kind: "directory"; name: string; path: string; fileCount: number }
  | { kind: "file"; key: string; file: ExplorerFile };
type ExplorerDirectoryEntry = Extract<ExplorerEntry, { kind: "directory" }>;

function normalizedPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

export function listDirectoryEntries(
  entries: Record<string, ExplorerFile>,
  repository: string,
  directory: string,
  query = "",
): ExplorerEntry[] {
  const basePath = normalizedPath(directory);
  const prefix = basePath ? `${basePath}/` : "";
  const search = query.trim().toLowerCase();
  const directories = new Map<string, number>();
  const files: ExplorerEntry[] = [];

  for (const [key, file] of Object.entries(entries)) {
    if (file.repository !== repository) continue;

    const filePath = normalizedPath(file.filePath);
    if (!filePath.startsWith(prefix)) continue;
    const remainder = filePath.slice(prefix.length);
    if (!remainder) continue;
    const [firstSegment, ...remainingSegments] = remainder.split("/");

    if (remainingSegments.length > 0) {
      const path = prefix + firstSegment;
      if (!search || `${key} ${file.filePath} ${file.fileName}`.toLowerCase().includes(search)) {
        directories.set(path, (directories.get(path) ?? 0) + 1);
      }
      continue;
    }

    if (!search || `${key} ${file.filePath} ${file.fileName}`.toLowerCase().includes(search)) {
      files.push({ kind: "file", key, file });
    }
  }

  const directoryEntries: ExplorerDirectoryEntry[] = Array.from(directories, ([path, fileCount]) => ({
    kind: "directory",
    name: path.split("/").at(-1) ?? path,
    path,
    fileCount,
  }));
  directoryEntries.sort((left, right) => left.name.localeCompare(right.name));
  files.sort((left, right) => {
    if (left.kind !== "file" || right.kind !== "file") return 0;
    return left.file.fileName.localeCompare(right.file.fileName);
  });
  return [...directoryEntries, ...files];
}

export function getFileTypeBadge(fileName: string): { label: string; kind: string } {
  const normalizedName = fileName.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalizedName.includes("CNOTES")) return { label: "CN", kind: "cnotes" };
  if (normalizedName.includes("GLOSSARY")) return { label: "GL", kind: "glossary" };
  if (normalizedName.includes("NOTES")) return { label: "NT", kind: "notes" };

  const extension = fileName.split(".").at(-1)?.toUpperCase();
  return extension && extension !== fileName.toUpperCase()
    ? { label: extension.slice(0, 3), kind: "file" }
    : { label: "FILE", kind: "file" };
}
