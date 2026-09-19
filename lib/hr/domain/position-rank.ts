// Seniority ranking for free-text job titles, so the Directory can list each
// group senior-first. Titles carry no built-in rank, so we score them by:
//   1. a role-keyword TIER: VP > Director > Manager > Supervisor > Lead >
//      Coordinator > Administrator > individual contributor (the catch-all);
//   2. within the IC tier, a FAMILY bump so every "Associate" outranks every
//      non-Associate IC (Analyst, Developer, Accountant, ...) regardless of level
//      — an Example Co convention: Associate is a more senior band than Analyst;
//   3. a trailing LEVEL (roman numeral III/II/I or a digit) that orders the
//      ladder within a family (Associate III > II > I; Analyst III > II > I).
// Unknown titles fall into the IC/non-Associate band so new titles still sort
// sensibly. Pure + deterministic.

const TIERS: [RegExp, number][] = [
  [/\b(chief|vice president|president|vp)\b/, 9],
  [/\bdirector\b/, 8],
  [/\bmanager\b/, 7],
  [/\bsupervisor\b/, 6],
  [/\blead\b/, 5],
  [/\bcoordinator\b/, 4],
  [/\badministrator\b/, 3],
];

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };

/** Trailing level of a title: a roman numeral or digit at the end, else 0. */
function titleLevel(p: string): number {
  const m = p.match(/\s([ivx]+|\d+)\s*$/);
  if (!m) return 0;
  const t = m[1];
  if (/^\d+$/.test(t)) return Math.min(Number(t), 9);
  return ROMAN[t] ?? 0;
}

/** Higher = more senior. Deterministic; used to sort a group senior-first. */
export function positionSeniority(position: string | null | undefined): number {
  if (!position || !position.trim()) return 0;
  const p = position.toLowerCase();
  let tier = 2; // individual contributor / unknown
  for (const [re, w] of TIERS) {
    if (re.test(p)) { tier = w; break; }
  }
  // Within the IC tier, an "Associate" is a more senior band than any other IC
  // (Analyst, Developer, ...). The +10 bump outweighs any level (max single
  // digit), so every Associate sorts above every non-Associate IC.
  const associateBand = tier === 2 && /\bassociate\b/.test(p) ? 10 : 0;
  return tier * 100 + associateBand + titleLevel(p);
}

/**
 * Comparator: most senior first, then by display name (A-Z) as a stable tiebreak.
 * `name` falls back to the employee id when the display name is missing.
 */
export function bySeniorityThenName(
  a: { position: string | null; fullName: string | null; empId: string },
  b: { position: string | null; fullName: string | null; empId: string },
): number {
  const d = positionSeniority(b.position) - positionSeniority(a.position);
  if (d !== 0) return d;
  return (a.fullName ?? a.empId).localeCompare(b.fullName ?? b.empId);
}
