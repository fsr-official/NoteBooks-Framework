import { existsSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { normalizeRepositoryPath } from "@/lib/file-download";

type LocalHtmlDirectoryOptions = {
  configuredDirectory?: string;
  nodeEnv?: string;
  workingDirectory?: string;
};

export function localPrecompiledHtmlDirectory(
  owner: string,
  repository: string,
  options: LocalHtmlDirectoryOptions = {},
): string | undefined {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  if (nodeEnv !== "development") return undefined;

  const configuredDirectory = options.configuredDirectory ?? process.env.NOTEBOOKS_MDX_HTML_DIRECTORY;
  if (configuredDirectory?.trim()) return configuredDirectory.trim();

  if (owner.toLowerCase() !== "fsr-official" || repository.toLowerCase() !== "notebooks-developers") {
    return undefined;
  }

  const workingDirectory = options.workingDirectory ?? process.cwd();
  return [
    path.resolve(workingDirectory, "../NoteBooks-Developers"),
    path.resolve(workingDirectory, "NoteBooks-Developers"),
  ].find(existsSync);
}

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
