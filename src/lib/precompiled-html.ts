import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { normalizeRepositoryPath } from "@/lib/file-download";

export async function readLocalPrecompiledHtml(directory: string, filePath: string): Promise<string> {
  const normalizedPath = normalizeRepositoryPath(filePath);
  if (!normalizedPath || !/\.html$/i.test(normalizedPath)) {
    throw new Error("The local compiled HTML path is invalid");
  }

  const root = await realpath(directory);
  const target = path.resolve(root, ...normalizedPath.split("/"));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("The local compiled HTML path escapes its build directory");
  }

  const resolvedTarget = await realpath(target);
  if (!resolvedTarget.startsWith(`${root}${path.sep}`)) {
    throw new Error("The local compiled HTML file resolves outside its build directory");
  }
  return readFile(resolvedTarget, "utf8");
}
