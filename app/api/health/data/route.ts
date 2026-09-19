import { DB } from "@/lib/db/schemas";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { classifyAuthProbe } from "@/lib/hr/domain/live-refresh-policy";
import { authBypassEnabled } from "@/lib/demo/mode";
import { emailMode } from "@/lib/demo/email";

export const dynamic = "force-dynamic";

/** A healthy DB answers the canary read in ~ms; anything slower means the
 *  data service is struggling and a full page refresh would likely blow the
 *  PostgREST statement timeout, so the poll should sit this tick out. */
const PROBE_TIMEOUT_MS = 4000;

/**
 * Data-service health probe for the LiveRefresh poll gate (see
 * lib/hr/domain/live-refresh-policy.ts). The client checks this BEFORE calling
 * router.refresh(): a background refresh that fails server-side replaces the
 * page the user is reading with the error boundary, so during a struggling-DB
 * window the poll must skip the refresh and keep the working page instead.
 *
 * The canary reads `v_daily_report_approvals`, the view family every polled
 * page's heavy reads sit on. A trivial read on an unrelated small table would
 * pass right through a statement-timeout brownout that is killing exactly
 * these views, which is the failure class this gate exists for.
 *
 * - 200 → refresh is safe
 * - 401 → genuinely signed out (client still refreshes so the sign-in
 *         redirect happens)
 * - 503 → data OR auth service unhealthy (client keeps the page, shows a
 *         stale badge). Auth-service blips are deliberately 503, not 401:
 *         an auth-service outage must not redirect every open tab to /signin.
 */
export async function GET() {
  // Local verification stack: there is no Auth service to probe (lib/demo/mode.ts).
  if (!authBypassEnabled()) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      const auth = classifyAuthProbe(data?.user ?? null, error);
      if (auth === "signed_out") return NextResponse.json({ ok: false }, { status: 401 });
      if (auth === "unavailable") return NextResponse.json({ ok: false }, { status: 503 });
    } catch {
      return NextResponse.json({ ok: false }, { status: 503 });
    }
  }

  try {
    const svc = createServiceClient();
    // retry(false): the probe measures health RIGHT NOW; postgrest-js's
    // built-in GET retry (3 attempts, 1s/2s/4s backoff) would mask it.
    const { error } = await svc
      .schema(DB.analytics)
      .from("v_daily_report_approvals")
      .select("task_did")
      .limit(1)
      .retry(false)
      .abortSignal(AbortSignal.timeout(PROBE_TIMEOUT_MS))
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false }, { status: 503 });
    // emailMode is reported so a deployment can be checked from outside: it is
    // pinned to "off" (lib/demo/email.ts).
    return NextResponse.json({ ok: true, emailMode: emailMode() });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
