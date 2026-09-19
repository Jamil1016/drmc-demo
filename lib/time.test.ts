import { test, expect } from "@playwright/test";
import {
  formatEastern, formatPht, formatPhtInstant, formatWorkDate, formatWorkDateWithDay, weekendDayLabel, formatPhtDateShort, phtDayRangeUtc,
  formatPhtDate, formatPhtTime, formatDataRefreshPht,
  parseDisplayZone, zoneIana, zoneLabel, DEFAULT_DISPLAY_ZONE, DISPLAY_ZONE_COOKIE,
  formatZoned, formatZonedDate, formatZonedDateShort, formatZonedTime, formatZonedInstant,
  formatDataRefresh, zoneDayRangeUtc,
} from "./time";

test("formatEastern renders a UTC instant in Eastern time", () => {
  // 2026-06-22T04:00:00Z is 2026-06-22 00:00 EDT
  expect(formatEastern("2026-06-22T04:00:00Z")).toContain("2026");
  expect(formatEastern(null)).toBe("");
});

test("formatPht converts ET wall-clock to Philippine time, DST-aware", () => {
  // Summer (EDT, UTC-4): 09:05 ET -> +12h -> 09:05 PM PHT
  expect(formatPht("2026-06-24T09:05:00")).toBe("2026-06-24 09:05 PM");
  // Winter (EST, UTC-5): 09:05 ET -> +13h -> 10:05 PM PHT
  expect(formatPht("2026-01-15T09:05:00")).toBe("2026-01-15 10:05 PM");
  expect(formatPht(null)).toBe("");
});

test("formatPhtInstant renders a true UTC instant (timer start/end) in PHT", () => {
  // 2026-07-14T13:57:48Z -> +8h -> 2026-07-14 09:57 PM PHT (same PH day)
  expect(formatPhtInstant("2026-07-14T13:57:48+00:00")).toBe("2026-07-14 09:57 PM");
  // 2026-07-14T19:00:01Z -> +8h -> 2026-07-15 03:00 AM PHT (rolls to next PH day)
  expect(formatPhtInstant("2026-07-14T19:00:01+00:00")).toBe("2026-07-15 03:00 AM");
  expect(formatPhtInstant(null)).toBe("");
});

test("timer start/end must use formatPhtInstant, not formatPht (timer extract regression)", () => {
  // Guard for the timer-extract bug: start_time is a true instant. If formatPht
  // (meant for the ET-naive *_et columns) reads the UTC wall-clock 13:57 as
  // Eastern, the correct 09:57 PM rolls into a wrong next-day 01:57 AM. This is
  // the exact +4h shift seen in dr-monitoring-timers exports; formatPhtInstant
  // is the correct formatter and matches the "Worked on this day" drawer.
  expect(formatPht("2026-07-14T13:57:48")).toBe("2026-07-15 01:57 AM"); // wrong shape (do not use for instants)
  expect(formatPhtInstant("2026-07-14T13:57:48+00:00")).toBe("2026-07-14 09:57 PM"); // correct
});

test("formatWorkDate reshapes a calendar day to MM-DD-YYYY without a timezone shift", () => {
  expect(formatWorkDate("2026-06-25")).toBe("06-25-2026");
  expect(formatWorkDate("2026-06-25T00:00:00")).toBe("06-25-2026");
  expect(formatWorkDate(null)).toBe("");
});

test("formatWorkDateWithDay prefixes the weekday of the calendar day, no timezone shift", () => {
  expect(formatWorkDateWithDay("2026-09-07")).toBe("Mon, 09-07-2026"); // Monday
  expect(formatWorkDateWithDay("2026-06-25")).toBe("Thu, 06-25-2026");
  expect(formatWorkDateWithDay("2026-06-25T00:00:00")).toBe("Thu, 06-25-2026");
  expect(formatWorkDateWithDay("2026-01-04")).toBe("Sun, 01-04-2026");
  expect(formatWorkDateWithDay(null)).toBe("");
  expect(formatWorkDateWithDay("garbage")).toBe("garbage");
});

test("weekendDayLabel names Saturday and Sunday work dates and nothing else, no timezone shift", () => {
  expect(weekendDayLabel("2026-09-12")).toBe("Sat");
  expect(weekendDayLabel("2026-09-13")).toBe("Sun");
  expect(weekendDayLabel("2026-09-14")).toBeNull(); // Monday
  expect(weekendDayLabel("2026-09-11")).toBeNull(); // Friday
  expect(weekendDayLabel("2026-09-13T00:00:00")).toBe("Sun");
  expect(weekendDayLabel(null)).toBeNull();
  expect(weekendDayLabel("garbage")).toBeNull();
});

test("formatPhtDateShort renders a submitted/approved instant as MM-DD-YYYY hh:mm in PHT", () => {
  // 09:05 EDT -> +12h -> 09:05 PM PHT, same calendar day
  expect(formatPhtDateShort("2026-06-24T09:05:00")).toBe("06-24-2026 09:05 PM");
  expect(formatPhtDateShort(null)).toBe("");
});

test("phtDayRangeUtc spans one Manila day as UTC instants (PHT = UTC+8, no DST)", () => {
  const { startIso, endIso } = phtDayRangeUtc("2026-07-04");
  expect(startIso).toBe("2026-07-03T16:00:00.000Z"); // 2026-07-04 00:00 PHT
  expect(endIso).toBe("2026-07-04T16:00:00.000Z");   // 2026-07-05 00:00 PHT
});

/* ── Display zone (PHT | ET toggle) ─────────────────────────────────────── */

test("parseDisplayZone accepts exact \"ET\" only; everything else is PHT", () => {
  expect(DEFAULT_DISPLAY_ZONE).toBe("PHT");
  expect(DISPLAY_ZONE_COOKIE).toBe("hr-display-zone");
  expect(parseDisplayZone("ET")).toBe("ET");
  // Exact match by design: the cookie is written by us, so a lowercase or
  // padded value is treated as tampering/garbage and falls back to PHT.
  expect(parseDisplayZone("et")).toBe("PHT");
  expect(parseDisplayZone(" ET")).toBe("PHT");
  expect(parseDisplayZone("EST")).toBe("PHT");
  expect(parseDisplayZone("PHT")).toBe("PHT");
  expect(parseDisplayZone("")).toBe("PHT");
  expect(parseDisplayZone(null)).toBe("PHT");
  expect(parseDisplayZone(undefined)).toBe("PHT");
  expect(zoneIana("PHT")).toBe("Asia/Manila");
  expect(zoneIana("ET")).toBe("America/New_York");
  expect(zoneLabel("PHT")).toBe("PHT");
  expect(zoneLabel("ET")).toBe("ET");
});

test("formatZoned renders ET wall-clock in PHT or ET, DST-aware", () => {
  // Summer (EDT, UTC-4): 09:05 ET stays 09:05 AM in ET; +12h -> 09:05 PM PHT
  expect(formatZoned("2026-07-15T09:05:00", "ET")).toBe("2026-07-15 09:05 AM");
  expect(formatZoned("2026-07-15T09:05:00", "PHT")).toBe("2026-07-15 09:05 PM");
  // Winter (EST, UTC-5): 09:05 ET stays 09:05 AM in ET; +13h -> 10:05 PM PHT
  expect(formatZoned("2026-01-15T09:05:00", "ET")).toBe("2026-01-15 09:05 AM");
  expect(formatZoned("2026-01-15T09:05:00", "PHT")).toBe("2026-01-15 10:05 PM");
  // Evening ET rolls to the next PH calendar day; ET keeps its own day.
  expect(formatZonedDate("2026-07-15T20:30:00", "ET")).toBe("2026-07-15");
  expect(formatZonedDate("2026-07-15T20:30:00", "PHT")).toBe("2026-07-16");
  expect(formatZonedDateShort("2026-07-15T20:30:00", "ET")).toBe("07-15-2026 08:30 PM");
  expect(formatZonedDateShort("2026-07-15T20:30:00", "PHT")).toBe("07-16-2026 08:30 AM");
  expect(formatZonedTime("2026-01-15T20:30:00", "ET")).toBe("08:30 PM");
  expect(formatZonedTime("2026-01-15T20:30:00", "PHT")).toBe("09:30 AM");
  expect(formatZoned(null, "ET")).toBe("");
  expect(formatZonedDate(null, "ET")).toBe("");
  expect(formatZonedDateShort(null, "ET")).toBe("");
  expect(formatZonedTime(null, "ET")).toBe("");
});

test("formatZonedInstant renders a true UTC instant in PHT or ET, DST-aware", () => {
  // Summer: 13:57:48Z -> 09:57 AM EDT / 09:57 PM PHT
  expect(formatZonedInstant("2026-07-15T13:57:48+00:00", "ET")).toBe("2026-07-15 09:57 AM");
  expect(formatZonedInstant("2026-07-15T13:57:48+00:00", "PHT")).toBe("2026-07-15 09:57 PM");
  // Winter: 13:57:48Z -> 08:57 AM EST / 09:57 PM PHT
  expect(formatZonedInstant("2026-01-15T13:57:48+00:00", "ET")).toBe("2026-01-15 08:57 AM");
  expect(formatZonedInstant("2026-01-15T13:57:48+00:00", "PHT")).toBe("2026-01-15 09:57 PM");
  // Early-UTC instant is still the previous day in ET but the same day in PHT.
  expect(formatZonedInstant("2026-07-15T02:00:00Z", "ET")).toBe("2026-07-14 10:00 PM");
  expect(formatZonedInstant("2026-07-15T02:00:00Z", "PHT")).toBe("2026-07-15 10:00 AM");
  expect(formatZonedInstant("2026-07-15T02:00:00Z", "ET", "HH:mm")).toBe("22:00");
  expect(formatZonedInstant(null, "ET")).toBe("");
});

test("formatDataRefresh decides \"today\" in the display zone, not always Manila", () => {
  // now = 2026-07-15 12:00Z: 08:00 AM Jul 15 in ET, 08:00 PM Jul 15 in PHT.
  const now1 = Date.parse("2026-07-15T12:00:00Z");
  // 02:00Z is Jul 15 10:00 AM PHT (today) but Jul 14 10:00 PM ET (yesterday).
  expect(formatDataRefresh("2026-07-15T02:00:00Z", "PHT", now1)).toBe("10:00 AM");
  expect(formatDataRefresh("2026-07-15T02:00:00Z", "ET", now1)).toBe("Jul 14, 10:00 PM");

  // now = 2026-07-15 00:30Z: Jul 14 08:30 PM in ET, Jul 15 08:30 AM in PHT.
  const now2 = Date.parse("2026-07-15T00:30:00Z");
  // 14:00Z Jul 14 is Jul 14 10:00 AM ET (today) but Jul 14 10:00 PM PHT (yesterday).
  expect(formatDataRefresh("2026-07-14T14:00:00Z", "ET", now2)).toBe("10:00 AM");
  expect(formatDataRefresh("2026-07-14T14:00:00Z", "PHT", now2)).toBe("Jul 14, 10:00 PM");

  // Same instant in both zones on a shared day: clock only.
  expect(formatDataRefresh("2026-07-15T12:00:00Z", "ET", now1)).toBe("8:00 AM");
  expect(formatDataRefresh("2026-07-15T12:00:00Z", "PHT", now1)).toBe("8:00 PM");
  expect(formatDataRefresh(null, "ET", now1)).toBe("");
});

test("zoneDayRangeUtc spans one calendar day of the display zone", () => {
  expect(zoneDayRangeUtc("2026-07-04", "PHT")).toEqual({
    startIso: "2026-07-03T16:00:00.000Z", endIso: "2026-07-04T16:00:00.000Z",
  });
  // ET summer (EDT, UTC-4)
  expect(zoneDayRangeUtc("2026-07-04", "ET")).toEqual({
    startIso: "2026-07-04T04:00:00.000Z", endIso: "2026-07-05T04:00:00.000Z",
  });
  // ET winter (EST, UTC-5)
  expect(zoneDayRangeUtc("2026-01-15", "ET")).toEqual({
    startIso: "2026-01-15T05:00:00.000Z", endIso: "2026-01-16T05:00:00.000Z",
  });
});

test("legacy formatPht* helpers equal the zoned twins with \"PHT\" (exports/emails depend on this)", () => {
  const naive = ["2026-07-15T09:05:00", "2026-01-15T20:30:00", "2026-07-14T13:57:48", null];
  for (const v of naive) {
    expect(formatPht(v)).toBe(formatZoned(v, "PHT"));
    expect(formatPht(v, "HH:mm")).toBe(formatZoned(v, "PHT", "HH:mm"));
    expect(formatPhtDate(v)).toBe(formatZonedDate(v, "PHT"));
    expect(formatPhtDateShort(v)).toBe(formatZonedDateShort(v, "PHT"));
    expect(formatPhtTime(v)).toBe(formatZonedTime(v, "PHT"));
  }
  const iso = ["2026-07-14T13:57:48+00:00", "2026-01-15T13:57:48Z", "2026-07-15T02:00:00Z", null];
  for (const v of iso) {
    expect(formatPhtInstant(v)).toBe(formatZonedInstant(v, "PHT"));
    expect(formatPhtInstant(v, "MMM d")).toBe(formatZonedInstant(v, "PHT", "MMM d"));
    expect(formatDataRefreshPht(v)).toBe(formatDataRefresh(v, "PHT"));
  }
  expect(phtDayRangeUtc("2026-07-04")).toEqual(zoneDayRangeUtc("2026-07-04", "PHT"));
  expect(phtDayRangeUtc("2026-01-15")).toEqual(zoneDayRangeUtc("2026-01-15", "PHT"));
});
