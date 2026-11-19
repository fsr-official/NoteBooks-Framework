import { config } from "dotenv";
import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";
import {
  createPublicIndexDatabase,
  type PublicIndexStore,
  rebuildPublicIndexes,
  TREE_GROUPS,
} from "../src/lib/public-indexes";
import { createUpstashPublicIndexStore } from "../src/lib/upstash-public-index-store";

config({ path: ".env.local", quiet: true });

async function main(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const redisUrl = process.env.KV_REST_API_URL;
  const redisToken = process.env.KV_REST_API_TOKEN;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  if (!redisUrl || !redisToken) {
    throw new Error("KV_REST_API_URL and KV_REST_API_TOKEN are required to rebuild public indexes");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const redis = new Redis({ url: redisUrl, token: redisToken });
  const indexStore: PublicIndexStore = createUpstashPublicIndexStore(redis);
  const rebuilt = await rebuildPublicIndexes(createPublicIndexDatabase(supabase), indexStore, {
    groups: TREE_GROUPS,
    includeRepositories: true,
  });

  console.log(`Rebuilt public indexes: ${rebuilt.join(", ")}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Public index rebuild failed");
  process.exitCode = 1;
});
