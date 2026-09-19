import { DB } from "@/lib/db/schemas";
import { createServiceClient } from "@/lib/supabase/service";
import { withDbRetry } from "@/lib/hr/db-retry";

/** One of a member's daily-report approvers, as assigned on the roster. */
export type MemberApprover = { name: string; email: string | null; empId: string | null };

/** The roster's daily-report approvers for one member, in rank order. */
export async function getMemberApprovers(memberEmpId: string): Promise<MemberApprover[]> {
  const svc = createServiceClient();
  const data = await withDbRetry(async () => {
    const { data: rows, error } = await svc
      .schema(DB.reference)
      .from("ref_employee_approvers")
      .select("approver_name, approver_email, approver_emp_id, rank")
      .eq("emp_id", memberEmpId)
      .eq("kind", "dr")
      .order("rank");
    if (error) throw new Error(error.message);
    return rows;
  });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    name: r.approver_name as string,
    email: (r.approver_email as string) ?? null,
    empId: (r.approver_emp_id as string) ?? null,
  }));
}
