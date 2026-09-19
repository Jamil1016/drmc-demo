import { test, expect } from "@playwright/test";
import { parseVarianceParams, scopeVarianceRows } from "./variance-filters";
import type { VarianceRow } from "./variance-agg";

function row(over: Partial<VarianceRow>): VarianceRow {
  return {
    empId: "E1", employeeName: "A", email: null, carrierGroup: "Group A - Carrier A",
    displayGroup: "Carrier A", workDate: "2026-06-02", taskDid: "T", clockInEt: null,
    statedHoursNet: 8, timedHours: 8, varianceHours: 0, coveragePct: 100,
    variancePct: 0, breach: false, isActive: true, position: "Field Analyst II",
    ...over,
  };
}

test("parseVarianceParams applies defaults and validates ISO", () => {
  const p = parseVarianceParams({ dateFrom: "bad", group: "Carrier A,Nope", inactive: "show", position: "Field Analyst" });
  expect(p.groups).toEqual(["Carrier A"]);          // invalid group dropped
  expect(p.includeInactive).toBe(true);
  expect(p.positions).toEqual(["Field Analyst"]);
  expect(/^\d{4}-\d{2}-\d{2}$/.test(p.from)).toBe(true); // fell back to default
});

test("scopeVarianceRows filters by group, active, and base position", () => {
  const rows = [
    row({ empId: "1", displayGroup: "Carrier A", isActive: true, position: "Field Analyst II" }),
    row({ empId: "2", displayGroup: "Carrier B", isActive: true }),
    row({ empId: "3", displayGroup: "Carrier A", isActive: false }),
  ];
  const out = scopeVarianceRows(rows, { groups: ["Carrier A"], includeInactive: false, positions: ["Field Analyst"] });
  expect(out.map((r) => r.empId)).toEqual(["1"]);
});
