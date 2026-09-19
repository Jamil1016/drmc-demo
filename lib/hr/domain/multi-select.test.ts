import { test, expect } from "@playwright/test";
import { sameSelection } from "./multi-select";

test("equal sets in different order are the same selection", () => {
  expect(sameSelection(["b", "a"], ["a", "b"])).toBe(true);
});

test("empty vs empty is the same", () => {
  expect(sameSelection([], [])).toBe(true);
});

test("added value differs", () => {
  expect(sameSelection(["a"], ["a", "b"])).toBe(false);
});

test("removed value differs", () => {
  expect(sameSelection(["a", "b"], ["a"])).toBe(false);
});

test("same length, different members differs", () => {
  expect(sameSelection(["a", "b"], ["a", "c"])).toBe(false);
});
