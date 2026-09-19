import { DB } from "@/lib/db/schemas";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { withDbRetry } from "@/lib/hr/db-retry";
import { authBypassEnabled, DEMO_USER_EMAIL } from "@/lib/demo/mode";
import { normalizeEmail } from "./email";
import type { AppRole } from "./roles";

export type { AppRole };

/** Cookie that, when set by a super_admin, previews the app as another user (read-only). */
export const PREVIEW_COOKIE = "drmc_preview_as";

export type AppUser = {
  id: number;
  email: string;
  /** Display name: the authoritative directory name (current employee version),
   *  falling back to the sign-in identity, then null (→ email is shown). */
  name: string | null;
  role: AppRole;
  isActive: boolean;
  authUserId: string | null;
};

export type AppSession = {
  authEmail: string;
  appUser: AppUser | null;
  /** When a super_admin is previewing as another user, appUser is the TARGET
   *  (impersonated) user and realUser is the actual super_admin. null otherwise. */
  preview: { realUser: AppUser } | null;
};

/**
 * Resolve the current auth user + allowlist row (drmc_app.hr_app_user).
 *
 * Wrapped in React `cache()` so the layout and the page (and any guard) that
 * each call getSession() during a single request share ONE result instead of
 * re-running `auth.getUser()` + the allowlist query per call. `cache()`
 * dedupes per-request only, so a mutation + revalidate still sees fresh data.
 */
export const getSession = cache(async function getSession(): Promise<AppSession | null> {
  // Local verification only (refused in production and on Vercel, see
  // lib/demo/mode.ts): a Postgres + PostgREST stack has no Auth service, so the
  // request is treated as the demo user without asking Supabase Auth.
  const user = authBypassEnabled() ? { id: null, email: DEMO_USER_EMAIL, user_metadata: {} } : await authUser();
  if (!user) return null;

  const email = normalizeEmail(user.email);
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const rawName = meta.full_name ?? meta.name;
  const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : null;
  const svc = createServiceClient();
  // The allowlist row and the directory display name both key on email alone,
  // so they go out in parallel: one DB round trip per request instead of two.
  // The name lookup is best-effort (fallback to the sign-in identity name) and
  // is simply unused when the caller turns out not to be allowlisted.
  //
  // Retry-once on transient DB failures (a brief database brownout would
  // otherwise throw every page to the error boundary). The allowlist error throws INSIDE the
  // retry closure so withDbRetry can retry it; the misconfiguration message
  // below is preserved on double failure. The directory-name lookup stays
  // best-effort: its error never throws.
  const [allowRes, dirRes] = await withDbRetry(async () =>
    Promise.all([
      svc
        .schema(DB.app)
        .from("hr_app_user")
        .select("id, email, role, is_active, auth_user_id")
        .eq("email", email)
        .eq("is_active", true)
        .maybeSingle<{
          id: number; email: string; role: AppRole; is_active: boolean; auth_user_id: string | null;
        }>()
        .then((res) => {
          if (res.error) {
            throw new Error(
              `allowlist lookup failed (${res.error.code ?? "?"}): ${res.error.message}. ` +
                `If this is PGRST106, ${DB.app} is not on the PostgREST exposed-schemas list (see supabase/schema.sql).`,
            );
          }
          return res;
        }),
      svc
        .schema(DB.analytics)
        .from("v_employee_directory")
        .select("full_name, report_display_name")
        .ilike("email", email) // email is already normalized; no % or _ to escape
        // Deterministic when an email ever appears on two rows (rehire, alias):
        // prefer the active one, then the lowest emp_id; never exclude, so an
        // app user whose directory row is inactive still gets a name.
        .order("is_active", { ascending: false })
        .order("emp_id")
        .limit(1),
    ]),
  );
  const data = allowRes.data;
  const dirRows = dirRes.data;

  if (!data) return { authEmail: email, appUser: null, preview: null };

  // Link the auth_user_id on first sighting.
  if (!data.auth_user_id && user.id) {
    const { error: linkError } = await svc.schema(DB.app).from("hr_app_user")
      .update({ auth_user_id: user.id, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (linkError) console.error(`Failed to link auth_user_id for hr_app_user id=${data.id}: ${linkError.message}`);
  }

  // Prefer the directory's SHORT display name over the sign-in identity name:
  // report_display_name is the name the report tables show ("Ada Lindqvist"),
  // full_name is the formal roster name ("Lindqvist, Ada"), so the sidebar
  // matches the tables. Best-effort: on any error we keep the email fallback.
  const dir = dirRows?.[0] as { full_name?: string | null; report_display_name?: string | null } | undefined;
  const pick = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const displayName = pick(dir?.report_display_name) ?? pick(dir?.full_name) ?? name;

  const realUser: AppUser = {
    id: data.id,
    email: data.email,
    name: displayName,
    role: data.role,
    isActive: data.is_active,
    authUserId: data.auth_user_id ?? user.id ?? null,
  };

  // Preview mode: only a super_admin's OWN session can ever be redirected to
  // impersonate another user. A non-super_admin with this cookie set is a no-op:
  // they always get their own normal session below.
  if (realUser.role === "super_admin") {
    const jar = await cookies();
    const raw = jar.get(PREVIEW_COOKIE)?.value;
    const targetId = raw ? Number(raw) : NaN;
    if (Number.isInteger(targetId) && targetId > 0 && targetId !== realUser.id) {
      const { data: target } = await svc
        .schema(DB.app)
        .from("hr_app_user")
        .select("id, email, role, is_active, auth_user_id")
        .eq("id", targetId)
        .eq("is_active", true)
        .maybeSingle<{
          id: number; email: string; role: AppRole; is_active: boolean; auth_user_id: string | null;
        }>();
      if (target) {
        return {
          authEmail: email,
          appUser: {
            id: target.id,
            email: target.email,
            name: null,
            role: target.role,
            isActive: target.is_active,
            authUserId: target.auth_user_id,
          },
          preview: { realUser },
        };
      }
      // Target not found/inactive: fall through and ignore the stale cookie.
    }
  }

  return {
    authEmail: email,
    appUser: realUser,
    preview: null,
  };
});

/** The Supabase Auth user for this request, or null. Validated against the Auth
 *  server (getUser), not just read from the cookie. */
async function authUser(): Promise<{ id: string | null; email?: string; user_metadata?: unknown } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}
