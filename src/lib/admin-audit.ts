import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface AdminAuditEvent {
  accountId: string;
  action: string;
  details?: Record<string, string | number | boolean | null>;
  resource: string;
}

export async function recordAdminAuditEvent(event: AdminAuditEvent): Promise<void> {
  const { error } = await createSupabaseAdminClient()
    .from("admin_audit_events")
    .insert({
      account_id: event.accountId,
      action: event.action,
      details: event.details ?? {},
      resource: event.resource,
    });
  if (error) throw new Error(`Unable to record admin audit event: ${error.message}`);
}
