import "server-only";

import { createPublicIndexDatabase, rebuildPublicIndexes } from "@/lib/public-indexes";
import { getPublicIndexStore } from "@/lib/public-index-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function rebuildAdminRepositoryIndexes(): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await rebuildPublicIndexes(
    createPublicIndexDatabase(supabase),
    getPublicIndexStore(),
    { includeRepositories: true },
  );
}
