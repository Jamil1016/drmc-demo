import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/ui/Logo";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { OrgLatticeField } from "@/components/ui/OrgLatticeField";
import { EnterDemoButton } from "@/components/auth/EnterDemoButton";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { authBypassEnabled } from "@/lib/demo/mode";

type Props = { searchParams: Promise<{ err?: string }> };

const PILLARS = ["Directory", "Approvals", "Hours analysis"];

export default async function SignInPage({ searchParams }: Props) {
  // Already signed in? Skip the door. The (app) layout re-checks the allowlist
  // and routes anyone not on it to /not-authorized.
  if (!authBypassEnabled()) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/");
  }

  const { err } = await searchParams;

  return (
    <main
      data-theme="brand"
      // The sign-in door renders at true 100% — the whole-app 90% zoom (html{zoom})
      // is deliberately NOT applied here. Counter-zoom by the reciprocal so this
      // subtree nets to scale 1.0, which also lets min-h-svh fill the real viewport
      // (no white strip below the fold from a 90%-tall box).
      style={{ zoom: "calc(1 / var(--app-zoom, 1))" }}
      className="relative isolate flex min-h-svh flex-col overflow-hidden bg-paper text-ink"
    >
      {/* Org-lattice backdrop, faded into the page */}
      <div aria-hidden className="field-mask pointer-events-none absolute inset-0 text-ink">
        <OrgLatticeField opacity={0.1} />
      </div>

      <div className="relative z-20">
        <DemoBanner />
      </div>

      {/* Brand corner */}
      <header className="relative z-10 px-6 py-6 sm:px-10">
        <Logo size={22} withWordmark />
      </header>

      {/* Centerpiece — a single quiet, left-anchored column */}
      <section className="relative z-10 flex flex-1 items-center">
        <div className="mx-auto w-full max-w-5xl px-6 pb-20 sm:px-10">
          <div className="max-w-2xl">
            <Eyebrow className="rise rise-delay-1">Public demo</Eyebrow>

            <h1 className="rise rise-delay-2 mt-5 font-display text-[clamp(38px,5.6vw,60px)] leading-[0.98] tracking-tight text-ink">
              Everyone at Example Co,
              <br />
              <span className="text-signal">on the record.</span>
            </h1>

            <p className="rise rise-delay-3 mt-6 max-w-md text-[15px] leading-relaxed text-muted">
              DRMC is a workforce report-compliance app: the employee directory,
              daily-report approvals with a durable bulk approve, and hours
              analysis. This copy runs on invented data.
            </p>

            <div className="rise rise-delay-4 mt-9">
              <EnterDemoButton />

              <p className="mt-4 max-w-md text-xs text-muted">
                No account needed. You enter as a shared demo user with the{" "}
                <span className="font-mono text-[12px] text-ink-soft">manager</span>{" "}
                role. Approvals are real writes to the demo database and are
                reset nightly.
              </p>
            </div>

            {err && (
              <div
                role="alert"
                className="rise mt-6 max-w-md rounded-md border px-4 py-3 text-[13px] leading-relaxed"
                style={{ borderColor: "var(--rule-strong)", background: "var(--card)" }}
              >
                <p className="font-mono text-[11px] uppercase tracking-wider text-signal">
                  Sign-in failed
                </p>
                <p className="mt-1 text-ink-soft">{decodeURIComponent(err)}</p>
              </div>
            )}

            {/* The three things this demo shows. */}
            <ul className="rise rise-delay-5 mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] uppercase tracking-[0.14em] text-muted">
              {PILLARS.map((p, i) => (
                <li key={p} className="flex items-center gap-4">
                  {i > 0 && <span aria-hidden className="hairline h-3 w-px" />}
                  <span className="font-mono">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Restrained footer */}
      <footer className="relative z-10 px-6 pb-7 sm:px-10">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted">
          Example Co · DRMC · Demo
        </p>
      </footer>
    </main>
  );
}
