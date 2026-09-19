import { test, expect } from "@playwright/test";
import { variancePctColor, breachPctColor, darkenHex } from "./variance-color";

test("variance color pivots on the 15% breach line", () => {
  expect(variancePctColor(-10)).toBe("#57a07c"); // worked >= stated: deepest green
  expect(variancePctColor(0)).toBe("#57a07c");
  expect(variancePctColor(5)).toBe("#8dc4a3");   // light green
  expect(variancePctColor(12)).toBe("#bcdcc7");
  expect(variancePctColor(15)).toBe("#e2897b");  // light red exactly at the breach line
  expect(variancePctColor(24)).toBe("#cc5647");
  expect(variancePctColor(40)).toBe("#a5342a");  // deepest red
});

test("darkenHex deepens a scale color while keeping the hue", () => {
  // 40% darker (factor 0.6): each channel scaled, hue preserved.
  expect(darkenHex("#57a07c")).toBe("#34604a"); // deep green -> darker green
  expect(darkenHex("#e2897b")).toBe("#88524a"); // light red  -> darker red
  expect(darkenHex("#a5342a")).toBe("#631f19"); // deepest red -> darker still
  // stays a valid 7-char hex even when a channel drops below 16 (zero padding).
  expect(darkenHex("#100000", 0.5)).toBe("#080000");
});

test("breach-share color: 0% green, higher = red", () => {
  expect(breachPctColor(0)).toBe("#57a07c");
  expect(breachPctColor(8)).toBe("#bcdcc7");
  expect(breachPctColor(18)).toBe("#e2897b");
  expect(breachPctColor(30)).toBe("#cc5647");
  expect(breachPctColor(45)).toBe("#a5342a");
});
