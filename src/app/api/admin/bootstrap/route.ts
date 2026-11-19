import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedAccount } from "@/lib/authenticated-account";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { withApiTelemetry } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

function matchesBootstrapToken(candidate: string, expected: string): boolean {
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

async function postBootstrap(request: Request) {
  let account;
  try {
    account = await getAuthenticatedAccount(request);
  } catch (error) {
    console.error("Admin bootstrap account verification failed", error);
    return NextResponse.json({ error: "Unable to verify application account" }, { status: 503 });
  }
  if (!account) return NextResponse.json({ error: "Sign in before administrator setup" }, { status: 401 });
  if (account.role === "admin") return NextResponse.json({ error: "This account is already an administrator" }, { status: 409 });

  const expectedToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
  if (!expectedToken || Buffer.byteLength(expectedToken, "utf8") < 32) {
    return NextResponse.json({ error: "Administrator bootstrap is not configured" }, { status: 503 });
  }

  const body = await request.text();
  if (body.length > 2048) return NextResponse.json({ error: "Request body is too large" }, { status: 413 });

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const token = payload && typeof payload === "object"
    ? (payload as Record<string, unknown>).token
    : null;
  if (typeof token !== "string" || !matchesBootstrapToken(token, expectedToken)) {
    return NextResponse.json({ error: "Invalid administrator bootstrap token" }, { status: 403 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: administrator, error: lookupError } = await supabase
    .from("accounts")
    .select("account_id")
    .eq("role", "admin")
    .maybeSingle();
  if (lookupError) {
    console.error("Administrator bootstrap check failed", lookupError);
    return NextResponse.json({ error: "Unable to check administrator setup" }, { status: 503 });
  }
  if (administrator) return NextResponse.json({ error: "An administrator already exists" }, { status: 409 });

  const { data: promoted, error: promoteError } = await supabase
    .from("accounts")
    .update({ role: "admin" })
    .eq("auth_user_id", account.user.id)
    .eq("role", "user")
    .select("account_id")
    .maybeSingle();
  if (promoteError) {
    if (promoteError.code === "23505") {
      return NextResponse.json({ error: "Administrator setup was completed by another account" }, { status: 409 });
    }
    console.error("Administrator bootstrap promotion failed", promoteError);
    return NextResponse.json({ error: "Unable to create the administrator account" }, { status: 503 });
  }
  if (!promoted) {
    return NextResponse.json({ error: "Administrator setup was already completed" }, { status: 409 });
  }

  try {
    await recordAdminAuditEvent({
      accountId: account.accountId,
      action: "admin.bootstrap",
      resource: account.accountId,
    });
  } catch (error) {
    console.error("Administrator was created but the audit event could not be recorded", error);
    return NextResponse.json({ error: "Administrator created, but audit logging failed" }, { status: 503 });
  }

  return NextResponse.json(
    { accountId: account.accountId, status: "admin-created" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const POST = withApiTelemetry("/api/admin/bootstrap", "POST", postBootstrap);
