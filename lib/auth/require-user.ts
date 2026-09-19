import { redirect } from "next/navigation";
import { getSession, type AppUser } from "./session";
import { roleAtLeast, type AppRole } from "./roles";
import { isDemoMode } from "@/lib/demo/mode";
import { DEMO_MUTATION_REFUSED, isAllowedDemoMutation } from "@/lib/demo/mutations";

/** Throws if the caller is currently previewing as another user (read-only mode).
 *  Call at the top of every mutation server action so a preview can never write. */
export async function assertNotPreviewing(): Promise<void> {
  const session = await getSession();
  if (session?.preview) {
    throw new Error("This action is disabled while previewing as another user. Exit preview to continue.");
  }
}

/**
 * The one gate every mutating server action goes through. It extends the
 * preview rule above into an allowlist: visitors to the demo share one account,
 * so only the mutations named in lib/demo/mutations.ts (approve, bulk approve,
 * batch resume + retry) may change data. This build only runs in demo mode, so
 * a process started without DEMO_MODE=true refuses every write.
 */
export async function assertMutationAllowed(kind: string): Promise<void> {
  await assertNotPreviewing();
  if (!isDemoMode()) throw new Error("This build only runs in demo mode (DEMO_MODE=true).");
  if (!isAllowedDemoMutation(kind)) throw new Error(DEMO_MUTATION_REFUSED);
}

/** The real signed-in user, ignoring any active preview (for authorizing start/stop preview). */
export async function requireRealSuperAdmin(): Promise<AppUser> {
  const session = await getSession();
  const real = session?.preview?.realUser ?? session?.appUser ?? null;
  if (!real || real.role !== "super_admin") throw new Error("Not authorized");
  return real;
}

export async function requireUser(): Promise<AppUser> {
  const session = await getSession();
  if (!session || !session.appUser) {
    throw new Error("Not authorized");
  }
  return session.appUser;
}

export async function requireRole(roles: AppRole[]): Promise<AppUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new Error("Not authorized");
  }
  return user;
}

/**
 * Server-action guard: the caller must be at least `min` (e.g. "manager").
 * THROWS on failure. Use inside server actions, where the client handles the error.
 */
export async function requireMinRole(min: AppRole): Promise<AppUser> {
  const user = await requireUser();
  if (!roleAtLeast(user.role, min)) {
    throw new Error("Not authorized");
  }
  return user;
}

/**
 * Page guard: the caller must be at least `min`. REDIRECTS to /not-authorized
 * (reason=role) on failure instead of throwing, so a direct-URL visit to a page
 * the user can't access renders a clean "no access" screen rather than a 500.
 * Use at the top of a server-component page.
 */
export async function requireMinRolePage(min: AppRole): Promise<AppUser> {
  const user = await requireUser();
  if (!roleAtLeast(user.role, min)) {
    redirect("/not-authorized?reason=role");
  }
  return user;
}
