import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

let cached: { enabled: boolean; expiresAt: number } | null = null;
let pending: Promise<boolean> | null = null;
const CACHE_TTL_MS = 15_000;

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
