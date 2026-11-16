import { isTreeGroup, type TreeGroup } from "@/lib/public-indexes";

const REPOSITORY_FIELDS = [
  "account_id",
  "branch",
  "class_or_stream",
  "empty",
  "enabled",
  "fallback",
  "lfs",
  "pages",
  "priority",
  "registry_name",
  "repo_name",
  "repo_owner",
  "root",
] as const;

export type AdminRepositoryInput = Partial<{
  account_id: string | null;
  branch: string;
  class_or_stream: TreeGroup;
  empty: boolean;
  enabled: boolean;
  fallback: string | null;
  lfs: boolean;
  pages: boolean;
  priority: number | null;
  registry_name: string;
  repo_name: string;
  repo_owner: string;
  root: string;
}>;

const REQUIRED_FIELDS = [
  "branch",
  "class_or_stream",
  "registry_name",
  "repo_name",
  "repo_owner",
] as const;

export function parseAdminRepositoryInput(
  value: unknown,
  options: { partial?: boolean } = {},
): AdminRepositoryInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !REPOSITORY_FIELDS.includes(key as typeof REPOSITORY_FIELDS[number]))) {
    return null;
  }
  if (!options.partial && REQUIRED_FIELDS.some((key) => !(key in input))) return null;
  if (options.partial && Object.keys(input).length === 0) return null;

  const result: AdminRepositoryInput = {};
  for (const [key, item] of Object.entries(input)) {
    switch (key) {
      case "account_id":
        if (item !== null && (typeof item !== "string" || !/^[a-z0-9][a-z0-9_-]{2,31}$/.test(item))) return null;
        result.account_id = item as string | null;
        break;
      case "branch":
        if (typeof item !== "string" || !item.trim() || item.length > 200
            || item.startsWith("-") || /[\u0000-\u001f\u007f]/.test(item)) return null;
        result.branch = item.trim();
        break;
      case "class_or_stream":
        if (!isTreeGroup(item)) return null;
        result.class_or_stream = item;
        break;
      case "registry_name":
        if (typeof item !== "string" || !item.trim() || item.trim().length > 160) return null;
        result.registry_name = item.trim();
        break;
      case "repo_owner":
        if (typeof item !== "string" || !/^[\w.-]{1,39}$/.test(item)) return null;
        result.repo_owner = item;
        break;
      case "repo_name":
        if (typeof item !== "string" || !/^[\w.-]{1,100}$/.test(item)) return null;
        result.repo_name = item;
        break;
      case "root":
        if (typeof item !== "string" || item.length > 500 || item.includes("\\")
            || item.startsWith("/") || item.split("/").some((part) => part === "." || part === "..")) return null;
        result.root = item.replace(/\/+$/g, "");
        break;
      case "enabled":
      case "empty":
      case "lfs":
      case "pages":
        if (typeof item !== "boolean") return null;
        result[key] = item;
        break;
      case "fallback":
        if (item !== null && (typeof item !== "string" || !/^[a-z0-9_-]{1,40}$/i.test(item))) return null;
        result.fallback = typeof item === "string" ? item.toLowerCase() : null;
        break;
      case "priority":
        if (item !== null && (!Number.isInteger(item) || (item as number) < 0 || (item as number) > 10000)) return null;
        result.priority = item as number | null;
        break;
    }
  }
  return result;
}
