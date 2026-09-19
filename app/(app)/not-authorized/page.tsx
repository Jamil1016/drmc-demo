import Link from "next/link";
import { signOut } from "../actions";

// Two cases land here:
//  - reason=role: an allowlisted user opened a page above their role (page guards
//    redirect here). They have a valid home, so offer a way back to the directory.
//  - default: signed in but not on the allowlist (the app layout redirects here).
export default async function NotAuthorizedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const roleCase = reason === "role";

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="surface max-w-sm p-8 text-center">
        <h1 className="page-title">{roleCase ? "No access" : "No access yet"}</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          {roleCase
            ? "You don't have access to this page. If you think you need it, ask an admin to update your role."
            : "You are signed in, but your account is not on the DRMC allowlist. Ask an admin to invite you."}
        </p>
        {roleCase ? (
          <Link href="/directory" className="btn-ghost mt-6 inline-block">Back to directory</Link>
        ) : (
          <form action={signOut} className="mt-6">
            <button type="submit" className="btn-ghost">Sign out</button>
          </form>
        )}
      </div>
    </div>
  );
}
