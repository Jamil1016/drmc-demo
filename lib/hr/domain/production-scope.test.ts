import { test, expect } from "@playwright/test";
import {
  PRODUCTION_CARRIER_GROUPS,
  DISPLAY_GROUPS,
  displayGroupForCarrier,
} from "./production-scope";

test("scope pins exactly the four verified production carrier_group strings", () => {
  expect([...PRODUCTION_CARRIER_GROUPS].sort()).toEqual(
    ["Group A - Carrier A", "Group B - Carrier B", "Group C - Carrier C/Fiber", "Group C - Carrier C/Rural"].sort(),
  );
});

test("display groups are the three production carriers in order", () => {
  expect([...DISPLAY_GROUPS]).toEqual(["Carrier A", "Carrier C", "Carrier B"]);
});

test("both Carrier C carrier groups map to one Carrier C display group", () => {
  expect(displayGroupForCarrier("Group C - Carrier C/Fiber")).toBe("Carrier C");
  expect(displayGroupForCarrier("Group C - Carrier C/Rural")).toBe("Carrier C");
  expect(displayGroupForCarrier("Group A - Carrier A")).toBe("Carrier A");
  expect(displayGroupForCarrier("Group B - Carrier B")).toBe("Carrier B");
});

test("non-production or null carrier groups map to null", () => {
  expect(displayGroupForCarrier("OPS")).toBeNull();
  expect(displayGroupForCarrier("")).toBeNull();
  expect(displayGroupForCarrier(null)).toBeNull();
});
