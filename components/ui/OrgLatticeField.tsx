type Props = {
  className?: string;
  /** Stroke/node color. Defaults to ink (white under the Example Co dark door). */
  stroke?: string;
  /** Base opacity (0–1). Lines sit at this; nodes a touch brighter. */
  opacity?: number;
};

/**
 * Org-lattice field — a faint repeating network of nodes joined by thin
 * branches, reading like an organization chart dissolving into the page.
 * It is the HR counterpart to quote-automation's TopographicField: same
 * role (atmospheric line-art behind the hero, softened by a radial mask),
 * but speaking this product's subject — people connected in a structure.
 *
 * Wrap in a positioned container; this fills its parent.
 */
export function OrgLatticeField({
  className = "",
  stroke = "var(--ink)",
  opacity = 0.1,
}: Props) {
  return (
    <svg
      aria-hidden
      className={`absolute inset-0 h-full w-full ${className}`}
      preserveAspectRatio="xMidYMid slice"
      style={{ color: stroke }}
    >
      <defs>
        <pattern
          id="org-lattice"
          x="0"
          y="0"
          width="220"
          height="200"
          patternUnits="userSpaceOnUse"
        >
          {/* Branches — a small two-level org tree spanning the tile. */}
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="0.7"
            strokeLinecap="round"
            opacity={opacity}
          >
            <path d="M110 28 L50 92 M110 28 L170 92" />
            <path d="M50 92 L24 162 M50 92 L82 162" />
            <path d="M170 92 L138 162 M170 92 L196 162" />
          </g>
          {/* Nodes — hollow rings at each junction, slightly brighter. */}
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="0.8"
            opacity={opacity * 1.5}
          >
            <circle cx="110" cy="28" r="3" />
            <circle cx="50" cy="92" r="2.6" />
            <circle cx="170" cy="92" r="2.6" />
            <circle cx="24" cy="162" r="2.2" />
            <circle cx="82" cy="162" r="2.2" />
            <circle cx="138" cy="162" r="2.2" />
            <circle cx="196" cy="162" r="2.2" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#org-lattice)" />
    </svg>
  );
}
