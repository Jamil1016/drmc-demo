/** Position a floating card next to an anchor rect, keeping it in the viewport.
 * Prefers the right of the anchor; flips to the left if it would overflow, and
 * clamps vertically. All values in viewport (client) pixels. */
export function placeCard(
  anchor: { top: number; bottom: number; left: number; right: number },
  viewport: { w: number; h: number },
  card: { w: number; h: number },
  gap = 8,
): { left: number; top: number } {
  let left = anchor.right + gap;
  if (left + card.w > viewport.w - gap) left = anchor.left - gap - card.w; // flip left
  if (left < gap) left = gap;

  let top = anchor.top;
  if (top + card.h > viewport.h - gap) top = viewport.h - gap - card.h; // clamp up
  if (top < gap) top = gap;

  return { left, top };
}
