"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authBypassEnabled, DEMO_USER_EMAIL, isDemoMode } from "@/lib/demo/mode";
import { logActivity } from "@/lib/hr/audit";

/** Where the demo user lands. Sent there directly (not through a second
 *  redirect) so the sign-in costs one hop. The demo user is a manager, whose
 *  home route is the role-aware Home page. */
const DEMO_HOME = "/";

const fail = (message: string): never => redirect(`/signin?err=${encodeURIComponent(message)}`);

/**
 * "Enter demo": sign the seeded demo user in, server-side. The visitor never
 * sees or types a credential; the password lives only in DEMO_USER_PASSWORD.
 */
export async function enterDemo(): Promise<void> {
  if (!isDemoMode()) fail("Demo mode is off (DEMO_MODE is not set to true), so nobody can sign in.");
  if (authBypassEnabled()) redirect(DEMO_HOME);

  const password = process.env.DEMO_USER_PASSWORD;
  if (!password) return fail("DEMO_USER_PASSWORD is not set on the server.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: DEMO_USER_EMAIL, password });
  if (error) fail(`Could not enter the demo: ${error.message}`);
  // The sign-in lands in the activity log AFTER the response is sent, so the
  // audit write never adds a database round trip to the visitor's first click.
  after(() => logActivity({
    actorEmail: DEMO_USER_EMAIL,
    action: "auth.sign_in",
    entity: "session",
    detail: { outcome: "granted", role: "manager" },
  }));
  redirect(DEMO_HOME);
}
