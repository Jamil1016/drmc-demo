"use client";

import type { DisplayZone } from "@/lib/time";
import { useDisplayZone } from "./DisplayZoneProvider";

const TITLE = "Show times in Philippine Time (PHT) / Eastern Time (ET)";
const ZONES: DisplayZone[] = ["PHT", "ET"];

/**
 * Global PHT | ET switch for every on-screen timestamp. Default (expanded
 * sidebar, mobile bar) is a two-segment pill group; `compact` (collapsed
 * sidebar rail) is a single tiny pill showing the active label that flips on
 * click. Styles: .zone-seg / .zone-pill in globals.css (sidebar rail language).
 */
export function DisplayZoneToggle({ compact = false }: { compact?: boolean }) {
  const { zone, setZone } = useDisplayZone();

  if (compact) {
    const other: DisplayZone = zone === "ET" ? "PHT" : "ET";
    return (
      <button
        type="button"
        className="zone-pill"
        onClick={() => setZone(other)}
        title={`${TITLE}. Now ${zone}; click for ${other}`}
        aria-label={`Times shown in ${zone}. Switch to ${other}`}
      >
        {zone}
      </button>
    );
  }

  return (
    <div className="zone-seg" role="group" aria-label="Timestamp display zone" title={TITLE}>
      {ZONES.map((z) => (
        <button
          key={z}
          type="button"
          aria-pressed={zone === z}
          onClick={() => { if (zone !== z) setZone(z); }}
        >
          {z}
        </button>
      ))}
    </div>
  );
}
