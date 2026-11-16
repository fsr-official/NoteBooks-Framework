import "server-only";

import { after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RouteHandler<Args extends unknown[]> = (...args: Args) => Response | Promise<Response>;

async function recordApiRequest(
  route: string,
  method: string,
  status: number,
  durationMs: number,
): Promise<void> {
  const { error } = await createSupabaseAdminClient().rpc("record_api_request_metric", {
    p_route: route,
    p_method: method,
    p_status: status,
    p_duration_ms: durationMs,
  });
  if (error) throw new Error(`Unable to record API request metric: ${error.message}`);
}

export function withApiTelemetry<Args extends unknown[]>(
  route: string,
  method: string,
  handler: RouteHandler<Args>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    const startedAt = Date.now();
    let status = 500;
    try {
      const response = await handler(...args);
      status = response.status;
      return response;
    } finally {
      if (process.env.NODE_ENV !== "test") {
        const durationMs = Math.max(0, Date.now() - startedAt);
        after(async () => {
          try {
            await recordApiRequest(route, method, status, durationMs);
          } catch (error) {
            console.error("API telemetry write failed", error);
          }
        });
      }
    }
  };
}
