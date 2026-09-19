import { test, expect } from "@playwright/test";
import {
  waitLabel,
  contextLabel,
  toItem,
  type UnassignedReport,
} from "./missing-approver";

// --- display shaping -------------------------------------------------------

test("waitLabel: dash for unknown, never 0d, plural days read the same", () => {
  expect(waitLabel(null)).toBe("—");
  expect(waitLabel(0)).toBe("0d waiting"); // 0 is a real value (submitted today), not "unknown"
  expect(waitLabel(1)).toBe("1d waiting");
  expect(waitLabel(12)).toBe("12d waiting");
});

test("contextLabel joins asset and milestone, tolerates blanks", () => {
  expect(contextLabel("Nina Park_260050", "07. July")).toBe("Nina Park_260050 · 07. July");
  expect(contextLabel("AssetA", null)).toBe("AssetA");
  expect(contextLabel(null, "07. July")).toBe("07. July");
  expect(contextLabel(null, null)).toBe("—");
  expect(contextLabel("   ", "")).toBe("—"); // whitespace-only counts as blank
});

const row = (over: Partial<UnassignedReport> = {}): UnassignedReport => ({
  taskDid: "t1",
  empId: "241001",
  employeeName: "Nina Park",
  memberEmail: "nina.park@example.com",
  workDate: "2026-07-21",
  assetName: "Nina Park_260050",
  milestone: "07. July",
  submittedOnEt: "2026-07-22 22:37:36",
  pendingWaitDays: 1,
  ...over,
});

test("toItem derives tone from wait days (on_time <=3, amber 4-7, red >7)", () => {
  expect(toItem(row({ pendingWaitDays: 1 })).waitTone).toBe("on_time");
  expect(toItem(row({ pendingWaitDays: 5 })).waitTone).toBe("amber");
  expect(toItem(row({ pendingWaitDays: 9 })).waitTone).toBe("red");
  expect(toItem(row({ pendingWaitDays: null })).waitTone).toBe("on_time"); // no data never shouts red
  const it = toItem(row());
  expect(it.waitLabel).toBe("1d waiting");
  expect(it.contextLabel).toBe("Nina Park_260050 · 07. July");
});

// --- re-notify guard -------------------------------------------------------
