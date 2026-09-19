import { test, expect } from "@playwright/test";
import { placeCard } from "./hover-card";

const VP = { w: 1000, h: 800 };
const CARD = { w: 300, h: 200 };

test("places to the right of the anchor when there is room", () => {
  const { left, top } = placeCard({ top: 100, bottom: 140, left: 200, right: 400 }, VP, CARD);
  expect(left).toBe(408); // right + gap
  expect(top).toBe(100); // aligned to anchor top
});

test("flips to the left when the right side would overflow", () => {
  // anchor.right (900) + card.w (300) + gap > viewport.w (1000) -> flip left
  const { left } = placeCard({ top: 100, bottom: 140, left: 700, right: 900 }, VP, CARD);
  expect(left).toBe(392); // left - gap - card.w
});

test("clamps vertically so the card stays in the viewport", () => {
  const { top } = placeCard({ top: 750, bottom: 790, left: 200, right: 400 }, VP, CARD);
  expect(top).toBe(592); // viewport.h - gap - card.h
});
