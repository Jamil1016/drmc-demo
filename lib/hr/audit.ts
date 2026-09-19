import { DB } from "@/lib/db/schemas";
import { createServiceClient } from "@/lib/supabase/service";

export type ActivityParams = {
  actorEmail: string;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: unknown;
};

/**
 * Write one row to app_hr.hr_audit_log. Best-effort: a failed audit write is
 * swallowed (logged to the server console) and never blocks the user action
 * that triggered it. `svc` is injectable for tests; defaults to a service client.
 */
export async function logActivity(
  p: ActivityParams,
  svc: ReturnType<typeof createServiceClient> = createServiceClient(),
): Promise<void> {
  try {
    const { error } = await svc.schema(DB.app).from("hr_audit_log").insert({
      actor_email: p.actorEmail,
      action: p.action,
      entity: p.entity,
      entity_id: p.entityId ?? null,
      detail: p.detail ?? null,
    });
    if (error) console.warn(`logActivity failed (${p.action}): ${error.message}`);
  } catch (e) {
    console.warn(`logActivity threw (${p.action}):`, e);
  }
}
