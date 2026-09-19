import { test, expect } from "@playwright/test";
import { groupDayActivities, type TimerActivityRow } from "./day-activities-prefetch";

const row = (email: string, startUtc: string, task = "t"): TimerActivityRow => ({
  user_email: email,
  start_time: startUtc,
  end_time: null,
  duration_min: 30,
  project: null,
  site_name: null,
  task,
  task_clean: null,
  asset_did: null,
});

test("attributes rows by case-insensitive email + ET day", () => {
  const pairs = [
    { taskDid: "a", email: "Uma@example.com", workDate: "2026-07-10" },
    { taskDid: "b", email: "bo@example.com", workDate: "2026-07-10" },
  ];
  // 2026-07-10 12:00 ET = 16:00 UTC (EDT)
  const rows = [row("uma@example.com", "2026-07-10T16:00:00+00:00"), row("BO@example.com", "2026-07-10T16:30:00+00:00")];
  const out = groupDayActivities(pairs, rows);
  expect(out.a.length).toBe(1);
  expect(out.b.length).toBe(1);
});

test("PH night shift stays on its ET start date", () => {
  const pairs = [{ taskDid: "a", email: "x@example.com", workDate: "2026-07-10" }];
  // 2026-07-11 02:00 UTC = 2026-07-10 22:00 ET -> belongs to the 07-10 report
  // 2026-07-11 05:00 UTC = 2026-07-11 01:00 ET -> different ET day, excluded
  const out = groupDayActivities(pairs, [
    row("x@example.com", "2026-07-11T02:00:00+00:00"),
    row("x@example.com", "2026-07-11T05:00:00+00:00"),
  ]);
  expect(out.a.length).toBe(1);
});

test("every requested taskDid gets an entry; null-email pairs stay empty", () => {
  const pairs = [
    { taskDid: "a", email: null, workDate: "2026-07-10" },
    { taskDid: "b", email: "y@example.com", workDate: "2026-07-09" },
  ];
  const out = groupDayActivities(pairs, [row("y@example.com", "2026-07-10T16:00:00+00:00")]);
  expect(out.a).toEqual([]);
  expect(out.b).toEqual([]); // wrong day for b
});

test("two reports sharing email+day both receive the rows; task_clean wins", () => {
  const pairs = [
    { taskDid: "a", email: "z@example.com", workDate: "2026-07-10" },
    { taskDid: "b", email: "Z@example.com", workDate: "2026-07-10" },
  ];
  const r = row("z@example.com", "2026-07-10T16:00:00+00:00");
  r.task_clean = "clean";
  const out = groupDayActivities(pairs, [r]);
  expect(out.a.length).toBe(1);
  expect(out.b.length).toBe(1);
  expect(out.a[0].task).toBe("clean");
});
