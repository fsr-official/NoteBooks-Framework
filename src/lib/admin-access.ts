import "server-only";

import { NextResponse } from "next/server";
import { getAuthenticatedAccount, type AuthenticatedAccount } from "@/lib/authenticated-account";

export async function requireAdmin(request: Request): Promise<{
  account: AuthenticatedAccount | null;
  response: NextResponse | null;
}> {
  let account: AuthenticatedAccount | null;
  try {
    account = await getAuthenticatedAccount(request);
  } catch (error) {
    console.error("Admin account verification failed", error);
    return {
      account: null,
      response: NextResponse.json({ error: "Unable to verify application account" }, { status: 503 }),
    };
  }

  if (!account) {
    return {
      account: null,
      response: NextResponse.json(
        { error: "A valid Supabase access token is required" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }
  if (account.role !== "admin") {
    return {
      account: null,
      response: NextResponse.json(
        { error: "Administrator access is required" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }
  return { account, response: null };
}
