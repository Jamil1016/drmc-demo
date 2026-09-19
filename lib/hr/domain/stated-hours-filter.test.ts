import { test, expect } from "@playwright/test";
import { parseStatedRange, statedNetToRawBounds } from "./stated-hours-filter";

test("empty / undefined bounds yield an unbounded range", () => {
  expect(parseStatedRange(undefined, undefined)).toEqual({ min: null, max: null });
  expect(parseStatedRange("", "  ")).toEqual({ min: null, max: null });
});

test("min only, max only, and band", () => {
  expect(parseStatedRange("1", undefined)).toEqual({ min: 1, max: null });
  expect(parseStatedRange(undefined, "4")).toEqual({ min: null, max: 4 });
  expect(parseStatedRange("1", "4")).toEqual({ min: 1, max: 4 });
  expect(parseStatedRange("0", "0")).toEqual({ min: 0, max: 0 });
});

test("non-numeric coerces to null; clamps to [0, 24]; rounds to 1 decimal", () => {
  expect(parseStatedRange("abc", "junk")).toEqual({ min: null, max: null });
  expect(parseStatedRange("-3", "99")).toEqual({ min: 0, max: 24 });
  expect(parseStatedRange("7.55", "8.44")).toEqual({ min: 7.6, max: 8.4 });
});

test("min greater than max swaps the two", () => {
  expect(parseStatedRange("4", "1")).toEqual({ min: 1, max: 4 });
});

test("raw bounds: positive min offsets by the 1h break", () => {
  expect(statedNetToRawBounds({ min: 1, max: 4 })).toEqual({ rawMin: 2, rawMax: 5, requireStated: true });
});

test("raw bounds: min 0 must NOT become raw >= 1 (a raw 0.5h row nets to 0)", () => {
  expect(statedNetToRawBounds({ min: 0, max: 0 })).toEqual({ rawMin: null, rawMax: 1, requireStated: true });
  expect(statedNetToRawBounds({ min: 0, max: null })).toEqual({ rawMin: null, rawMax: null, requireStated: true });
});

test("raw bounds: unbounded range requires nothing", () => {
  expect(statedNetToRawBounds({ min: null, max: null })).toEqual({ rawMin: null, rawMax: null, requireStated: false });
});
