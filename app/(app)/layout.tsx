import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Sidebar } from "@/components/layout/Sidebar";
import { NavProgress } from "@/components/layout/nav-progress";
import { PreviewBanner } from "@/components/layout/PreviewBanner";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { DisplayZoneProvider } from "@/components/layout/DisplayZoneProvider";
import { getDisplayZone } from "@/lib/display-zone.server";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/signin");
  if (!session.appUser) redirect("/not-authorized");

  // Timestamp display zone (PHT | ET). Read here once so the client provider is
  // seeded with the same value the server rendered with (no hydration flash).
  const zone = await getDisplayZone();

  return (
    <DisplayZoneProvider initialZone={zone}>
      <NavProgress>
        <div className="min-h-svh bg-paper text-ink md:flex">
          <Sidebar user={session.appUser} onSignOut={signOut} />
          <main className="min-w-0 flex-1">
            <DemoBanner />
            {session.preview && (
              <PreviewBanner targetLabel={session.appUser.email} targetRole={session.appUser.role} />
            )}
            <div className="w-full px-5 pb-6 pt-5 md:px-8 md:pb-8">{children}</div>
          </main>
        </div>
      </NavProgress>
    </DisplayZoneProvider>
  );
}
