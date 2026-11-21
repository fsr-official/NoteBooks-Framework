import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

let cached: { enabled: boolean; expiresAt: number } | null = null;
let pending: Promise<boolean> | null = null;
const CACHE_TTL_MS = 15_000;
const repositoryCache = new Map<string, { enabled: boolean; expiresAt: number }>();
const repositoryPending = new Map<string, Promise<boolean>>();

export async function isMdxRenderingEnabled(): Promise<boolean> {
  if (cached && cached.expiresAt > Date.now()) return cached.enabled;
  if (pending) return pending;

  pending = (async () => {
    const { data, error } = await createSupabaseAdminClient()
      .from("feature_flags")
      .select("enabled")
      .eq("flag_name", "mdx-rendering")
      .maybeSingle();
    if (error) throw new Error("Could not read the MDX rendering feature flag", { cause: error });
    if (!data || typeof data.enabled !== "boolean") {
      throw new Error("The mdx-rendering Supabase feature flag is missing or invalid");
    }
    cached = { enabled: data.enabled, expiresAt: Date.now() + CACHE_TTL_MS };
    return data.enabled;
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
}

export async function isRepositoryMdxRenderingEnabled(
  owner: string,
  repository: string,
): Promise<boolean> {
  const key = `${owner.toLowerCase()}/${repository.toLowerCase()}`;
  const cachedRepository = repositoryCache.get(key);
  if (cachedRepository && cachedRepository.expiresAt > Date.now()) return cachedRepository.enabled;
  const pendingRepository = repositoryPending.get(key);
  if (pendingRepository) return pendingRepository;

  const request = (async () => {
    const { data, error } = await createSupabaseAdminClient()
      .from("repository_entries")
      .select("mdx_styled_rendering")
      .eq("record_type", "repository")
      .eq("repo_owner", owner)
      .eq("repo_name", repository)
      .maybeSingle();
    if (error) throw new Error("Could not read the repository MDX rendering setting", { cause: error });
    if (!data) return false;
    if (typeof data.mdx_styled_rendering !== "boolean") {
      throw new Error("The repository MDX rendering setting is missing or invalid");
    }
    repositoryCache.set(key, { enabled: data.mdx_styled_rendering, expiresAt: Date.now() + CACHE_TTL_MS });
    return data.mdx_styled_rendering;
  })();

  repositoryPending.set(key, request);
  try {
    return await request;
  } finally {
    if (repositoryPending.get(key) === request) repositoryPending.delete(key);
  }
}

export function isTrustedMdxRepository(owner: string, repository: string): boolean {
  const entries = process.env.TRUSTED_MDX_REPOSITORIES;
  if (!entries) return false;
  const key = `${owner}/${repository}`.toLowerCase();
  return entries
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(key);
}
