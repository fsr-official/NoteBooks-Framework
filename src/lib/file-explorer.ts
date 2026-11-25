export interface ExplorerFile {
  fileName: string;
  filePath: string;
  repository: string;
}

export type ExplorerEntry =
  | { kind: "directory"; name: string; path: string; fileCount: number }
  | { kind: "file"; key: string; file: ExplorerFile };
type ExplorerDirectoryEntry = Extract<ExplorerEntry, { kind: "directory" }>;
export type ExplorerFileSort = "recommended" | "name-asc" | "name-desc";

function normalizedPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

function specialFileOrder(fileName: string): number {
  const { kind } = getFileTypeBadge(fileName);
  if (kind === "notes") return 0;
  if (kind === "cnotes") return 1;
  if (kind === "glossary") return 2;
  return 3;
}

export function compareExplorerFiles(
  leftFileName: string,
  rightFileName: string,
  sort: ExplorerFileSort = "recommended",
): number {
  const specialOrder = specialFileOrder(leftFileName) - specialFileOrder(rightFileName);
  if (specialOrder !== 0) return specialOrder;

  const nameOrder = leftFileName.localeCompare(rightFileName);
  return sort === "name-desc" ? -nameOrder : nameOrder;
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
    return compareExplorerFiles(left.file.fileName, right.file.fileName);
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
