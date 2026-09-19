"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppUser } from "@/lib/auth/session";
import { navSectionsFor } from "@/lib/nav";
import { NavPending } from "./nav-progress";
import { DisplayZoneToggle } from "./DisplayZoneToggle";

const iconProps = {
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

const ICONS: Record<string, React.ReactNode> = {
  home: (<svg {...iconProps}><path d="M4 11l8-6 8 6" /><path d="M6 10v9h4v-5h4v5h4v-9" /></svg>),
  directory: (<svg {...iconProps}><circle cx="9" cy="7" r="3.2" /><path d="M3.5 20v-1.5a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4V20" /><path d="M16 4a3.2 3.2 0 0 1 0 6.2" /><path d="M20.5 20v-1.5a4 4 0 0 0-3-3.8" /></svg>),
  org: (<svg {...iconProps}><rect x="9" y="3" width="6" height="5" rx="1.2" /><rect x="3" y="16" width="6" height="5" rx="1.2" /><rect x="15" y="16" width="6" height="5" rx="1.2" /><path d="M12 8v3M6 16v-1.5h12V16" /></svg>),
  approvals: (<svg {...iconProps}><circle cx="12" cy="12" r="9" /><path d="M8.5 12.2l2.3 2.3 4.7-4.8" /></svg>),
  scorecard: (<svg {...iconProps}><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="7" /><rect x="12" y="7" width="3" height="11" /><rect x="17" y="4" width="3" height="14" /></svg>),
  browse: (<svg {...iconProps}><line x1="8" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="20" y2="12" /><line x1="8" y1="18" x2="20" y2="18" /><circle cx="4" cy="6" r="1.1" /><circle cx="4" cy="12" r="1.1" /><circle cx="4" cy="18" r="1.1" /></svg>),
  users: (<svg {...iconProps}><path d="M12 21s7-3.5 7-9V5.5L12 3 5 5.5V12c0 5.5 7 9 7 9z" /><path d="M9.5 12l1.7 1.7 3.3-3.4" /></svg>),
  settings: (<svg {...iconProps}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>),
  activity: (<svg {...iconProps}><path d="M3 12h4l2 6 4-14 2 8h6" /></svg>),
  flag: (<svg {...iconProps}><path d="M5 21V4" /><path d="M5 4h13l-2.5 4L18 12H5" /></svg>),
};

function activeHref(pathname: string, items: { href: string }[]): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    const matches = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
    if (matches && (best === null || href.length > best.length)) best = href;
  }
  return best;
}

// Initials from a display name ("Ada Lindqvist" -> "AL"); falls back to the first
// two characters for a single token (e.g. an email local part).
function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Sidebar({ user, onSignOut }: { user: AppUser; onSignOut: () => Promise<void> }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("hr-sidebar-collapsed") === "1") setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("hr-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  const sections = navSectionsFor(user.role);
  const allItems = sections.flatMap((s) => s.items);
  const active = activeHref(pathname, allItems);

  return (
    <>
      {/* Desktop rail */}
      <aside
        data-collapsed={collapsed}
        className={`side hidden md:flex md:shrink-0 md:flex-col md:sticky md:top-0 md:h-[calc(100svh/var(--app-zoom,1))] transition-[width] duration-200 ${collapsed ? "md:w-[74px]" : "md:w-[248px]"}`}
      >
        <div className="brandrow flex items-center gap-2 px-4 pt-5 pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG mark, nothing to optimize */}
          <img className="side-mark" src="/example-mark.svg" alt="" />
          <span className="brand-text font-semibold text-[15px] text-white">
            Example Co <span style={{ color: "var(--accent)" }}>DRMC</span>
          </span>
          {!collapsed && (
            <button onClick={toggle} className="side-toggle ml-auto" aria-label="Collapse sidebar" title="Collapse">
              <svg {...iconProps} width={18} height={18}><path d="M15 6l-6 6 6 6" /></svg>
            </button>
          )}
        </div>
        {collapsed && (
          <div className="flex justify-center pb-1">
            <button onClick={toggle} className="side-toggle" aria-label="Expand sidebar" title="Expand">
              <svg {...iconProps} width={18} height={18}><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {sections.map((section) => (
            <div key={section.label} className="mb-4">
              <div className="side-label mb-1.5 px-2">{section.label}</div>
              {section.items.map((item) => (
                <Link key={item.href} href={item.href} className="nav-pill" data-active={active === item.href}>
                  {ICONS[item.icon]}
                  <span className="label">{item.label}</span>
                  <NavPending disabled={active === item.href} />
                  <span className="tip">{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Display-zone toggle sits above the user block, outside the sign-out form. */}
        <div className="side-zone">
          {!collapsed && <span className="zone-cap">Time zone</span>}
          <DisplayZoneToggle compact={collapsed} />
        </div>
        <form action={onSignOut} className="side-foot">
          <span className="av">{initials(user.name ?? user.email)}</span>
          <div className="foot-who min-w-0 flex-1">
            <div className="nm" title={user.email}>{user.name ?? user.email}</div>
            <div className="rl">{user.role.replace("_", " ")}</div>
          </div>
          <button type="submit" className="side-signout" aria-label="Sign out" title="Sign out">
            <svg {...iconProps} width={18} height={18}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          </button>
        </form>
      </aside>

      {/* Mobile top bar */}
      <header className="side md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold text-[15px] text-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG mark, nothing to optimize */}
            <img className="side-mark" src="/example-mark.svg" alt="" />
            Example Co <span style={{ color: "var(--accent)" }}>DRMC</span>
          </Link>
          <div className="flex items-center gap-3">
            <DisplayZoneToggle />
            <form action={onSignOut}>
              <button type="submit" className="text-xs" style={{ color: "var(--accent)" }}>Sign out</button>
            </form>
          </div>
        </div>
        <nav className="flex gap-1.5 overflow-x-auto px-3 pb-3">
          {allItems.map((item) => (
            <Link key={item.href} href={item.href} className="nav-pill shrink-0" data-active={active === item.href}>
              {ICONS[item.icon]}
              <span className="label">{item.label}</span>
              <NavPending disabled={active === item.href} />
            </Link>
          ))}
        </nav>
      </header>
    </>
  );
}
