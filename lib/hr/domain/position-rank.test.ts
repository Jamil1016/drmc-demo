import { test, expect } from "@playwright/test";
import { positionSeniority, bySeniorityThenName } from "./position-rank";

test("role tiers rank senior-first", () => {
  const order = [
    "Vice President",
    "Director of Research and Development",
    "Delivery Manager",
    "HR Supervisor",
    "Carrier Team Lead",
    "Operations Coordinator II",
    "Accounting Administrator",
    "Field Analyst II",
  ];
  const scores = order.map((p) => positionSeniority(p));
  for (let i = 1; i < scores.length; i++) {
    expect(scores[i - 1]).toBeGreaterThan(scores[i]);
  }
});

test("roman-numeral level orders the IC ladder", () => {
  expect(positionSeniority("Field Analyst III")).toBeGreaterThan(positionSeniority("Field Analyst II"));
  expect(positionSeniority("Field Analyst II")).toBeGreaterThan(positionSeniority("Field Analyst I"));
  expect(positionSeniority("Software Developer III")).toBeGreaterThan(positionSeniority("Software Developer I"));
});

test("every Associate outranks every Analyst, regardless of level", () => {
  // Family beats level: a level-I Associate still sorts above a level-III Analyst.
  expect(positionSeniority("Field Associate I")).toBeGreaterThan(positionSeniority("Field Analyst III"));
  expect(positionSeniority("Field Associate II")).toBeGreaterThan(positionSeniority("Field Analyst II"));
  expect(positionSeniority("Support Associate")).toBeGreaterThan(positionSeniority("Field Analyst III"));
  // Within the Associate band, level still orders.
  expect(positionSeniority("Field Associate III")).toBeGreaterThan(positionSeniority("Field Associate I"));
});

test("only Associate is boosted — other ICs stay at the Analyst band", () => {
  // Developer/Accountant are not boosted: tie with Analyst at the same level.
  expect(positionSeniority("Software Developer II")).toBe(positionSeniority("Field Analyst II"));
  expect(positionSeniority("Accountant II")).toBe(positionSeniority("Data Analyst II"));
  // ...and still sit below any Associate.
  expect(positionSeniority("Field Associate I")).toBeGreaterThan(positionSeniority("Software Developer III"));
});

test("null/blank/unknown titles score low but defined", () => {
  expect(positionSeniority(null)).toBe(0);
  expect(positionSeniority("   ")).toBe(0);
  // Unknown title falls into the IC tier (above 0, below a manager).
  const unknown = positionSeniority("Widget Wrangler");
  expect(unknown).toBeGreaterThan(0);
  expect(unknown).toBeLessThan(positionSeniority("Delivery Manager"));
});

test("comparator sorts senior-first then by name", () => {
  const rows = [
    { position: "Field Analyst I", fullName: "Zoe", empId: "3" },
    { position: "Delivery Manager", fullName: "Bob", empId: "1" },
    { position: "Field Analyst I", fullName: "Amy", empId: "2" },
  ];
  const sorted = [...rows].sort(bySeniorityThenName);
  expect(sorted.map((r) => r.fullName)).toEqual(["Bob", "Amy", "Zoe"]);
});
