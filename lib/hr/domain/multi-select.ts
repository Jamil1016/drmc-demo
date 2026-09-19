/** Order-insensitive equality for a multi-select's chosen values, so closing
 *  the popover without a real change never fires a filter navigation. */
export function sameSelection(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((v) => set.has(v));
}
