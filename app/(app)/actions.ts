"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PREVIEW_COOKIE } from "@/lib/auth/session";
import { authBypassEnabled } from "@/lib/demo/mode";

export async function signOut(): Promise<void> {
  if (!authBypassEnabled()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/signin");
}

/**
 * Exit a read-only "view as" preview and return to the real signed-in user.
 *
 * The original app lets a super_admin preview the app as another user from its
 * Settings page. That page is not part of this build (and the demo user is a
 * manager, not a super_admin), so a preview cannot be STARTED here; the
 * session + guard half of the pattern is kept because the demo's mutation
 * allowlist is built on it (see assertMutationAllowed). Clearing a cookie is
 * per-visitor and writes nothing to the database.
 */
export async function stopPreview(): Promise<void> {
  const jar = await cookies();
  jar.delete(PREVIEW_COOKIE);
  revalidatePath("/", "layout");
}
