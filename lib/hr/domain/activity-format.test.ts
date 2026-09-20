import { test, expect } from "@playwright/test";
import {
  ACTION_FILTER_OPTIONS, formatActionLabel, formatActivityObject, nextActivityCursor, normalizeActivityQuery,
} from "./activity-format";

test("normalizeActivityQuery defaults, clamps and drops junk", () => {
  expect(normalizeActivityQuery({})).toEqual({ limit: 50, before: undefined });
  expect(normalizeActivityQuery({ limit: "500" }).limit).toBe(100);
  expect(normalizeActivityQuery({ from: "2026-03-01", to: "03/02/2026" })).toMatchObject({ from: "2026-03-01" });
  expect(normalizeActivityQuery({ to: "03/02/2026" }).to).toBeUndefined();
  expect(normalizeActivityQuery({ before: "-4" }).before).toBeUndefined();
  expect(normalizeActivityQuery({ before: "120" }).before).toBe(120);
});

test("the actor filter is lower-cased and stripped to email characters", () => {
  expect(normalizeActivityQuery({ actor: "  Kasper.A  " }).actor).toBe("kasper.a");
  expect(normalizeActivityQuery({ actor: "%,or(id.gt.0)" }).actor).toBe("orid.gt.0");
  expect(normalizeActivityQuery({ actor: "%%" }).actor).toBeUndefined();
});

test("only a known action filters", () => {
  expect(normalizeActivityQuery({ action: "approval.approve" }).action).toBe("approval.approve");
  expect(normalizeActivityQuery({ action: "drop.table" }).action).toBeUndefined();
});

test("nextActivityCursor is the smallest id of a full page", () => {
  expect(nextActivityCursor([{ id: 9 }, { id: 7 }, { id: 8 }], 3)).toBe(7);
  expect(nextActivityCursor([{ id: 9 }], 3)).toBeNull();
  expect(nextActivityCursor([], 3)).toBeNull();
});

test("labels: mapped actions, and a readable fallback", () => {
  expect(formatActionLabel("approval.bulk_approve")).toBe("Bulk approved reports");
  expect(formatActionLabel("report.export_csv")).toBe("Export csv");
  expect(ACTION_FILTER_OPTIONS[0]).toEqual({ value: "", label: "All actions" });
  expect(ACTION_FILTER_OPTIONS.slice(1).map((o) => o.label)).toEqual(["Approved reports", "Bulk approved reports", "Signed in"]);
});

test("formatActivityObject reads approves as counts and sign-ins as a role", () => {
  const row = (action: string, detail: unknown) => ({ action, entity: "x", entity_id: null, detail });
  expect(formatActivityObject(row("approval.approve", { approved: 3, failed: 0 }))).toBe("3 approved");
  expect(formatActivityObject(row("approval.bulk_approve", { total: 39, approved: 36, failed: 3 }))).toBe("36 of 39 approved, 3 failed");
  expect(formatActivityObject(row("approval.bulk_approve", { total: 1 }))).toBe("total: 1");
  expect(formatActivityObject(row("auth.sign_in", { outcome: "granted", role: "manager" }))).toBe("granted · manager");
  expect(formatActivityObject(row("auth.sign_in", null))).toBe("");
  expect(formatActivityObject(row("other.thing", { a: 1, b: "" }))).toBe("a: 1");
});
