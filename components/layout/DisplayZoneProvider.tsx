"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DISPLAY_ZONE_COOKIE, DEFAULT_DISPLAY_ZONE, type DisplayZone } from "@/lib/time";

type DisplayZoneContextValue = { zone: DisplayZone; setZone: (z: DisplayZone) => void };

// Outside a provider (tests, stories, stray mounts) the app is plain PHT and
// setZone is a no-op, so nothing crashes.
const DisplayZoneContext = createContext<DisplayZoneContextValue>({
  zone: DEFAULT_DISPLAY_ZONE,
  setZone: () => {},
});

// Survives page-level key remounts the same way useVisibleColumns does: after
// the user toggles, every later mount reads the cached choice synchronously
// instead of the (possibly stale, pre-refresh) initialZone prop.
let cached: DisplayZone | null = null;

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function DisplayZoneProvider({ initialZone, children }: { initialZone: DisplayZone; children: React.ReactNode }) {
  // Seeded from the server-read cookie so the first client render equals the
  // server HTML (no hydration mismatch); the cache only exists post-toggle.
  const [zone, setZoneState] = useState<DisplayZone>(() => cached ?? initialZone);
  const router = useRouter();

  // The cookie can change outside this tab (toggle in another tab); the next
  // router.refresh()/navigation re-reads it into initialZone, so follow it or
  // server-rendered and context-driven timestamps end up in different zones.
  // Only fires when the server value changes, so the short window between
  // setZone() and the refresh landing (stale initialZone) does not undo it.
  useEffect(() => {
    if (initialZone !== zone) {
      cached = initialZone;
      setZoneState(initialZone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the server prop only
  }, [initialZone]);

  const setZone = useCallback((next: DisplayZone) => {
    cached = next;
    setZoneState(next);
    document.cookie = `${DISPLAY_ZONE_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    // Server components format their timestamps from the cookie, so refresh
    // to re-render them in the new zone; client components follow the context.
    router.refresh();
  }, [router]);

  const value = useMemo(() => ({ zone, setZone }), [zone, setZone]);
  return <DisplayZoneContext.Provider value={value}>{children}</DisplayZoneContext.Provider>;
}

export function useDisplayZone(): DisplayZoneContextValue {
  return useContext(DisplayZoneContext);
}
