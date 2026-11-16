import "server-only";

import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface AuthenticatedAccount {
  accountId: string;
  role: "admin" | "user";
  user: User;
}

export async function getAuthenticatedAccount(request: Request): Promise<AuthenticatedAccount | null> {
  const authorization = request.headers.get("authorization");
  const match = authorization && /^Bearer\s+([A-Za-z0-9._~-]+)$/.exec(authorization);
  if (!match) return null;

  const supabase = createSupabaseAdminClient();
  const { data: userData, error: authError } = await supabase.auth.getUser(match[1]);
  if (authError || !userData.user) return null;

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("account_id, role")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (accountError) throw new Error(`Unable to verify application account: ${accountError.message}`);
  if (!account || typeof account.account_id !== "string"
      || (account.role !== "admin" && account.role !== "user")) return null;

  return { accountId: account.account_id, role: account.role, user: userData.user };
}
