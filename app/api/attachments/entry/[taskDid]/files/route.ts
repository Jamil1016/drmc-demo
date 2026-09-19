import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getReportRequirements } from "@/lib/hr/queries/report-detail";
import { demoAttachmentItems } from "@/lib/demo/attachments";

/**
 * The drawer's attachment listing for one report. Read-only. In the demo the
 * listing is derived from the seeded per-requirement file counts and every file
 * is a generated placeholder image (see lib/demo/attachments.ts).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ taskDid: string }> }) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const { taskDid } = await ctx.params;
  const requirements = await getReportRequirements(taskDid);
  return NextResponse.json(
    { files: demoAttachmentItems(taskDid, requirements), source: "demo" },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
