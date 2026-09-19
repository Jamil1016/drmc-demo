import { test, expect } from "@playwright/test";
import { greetingFor, firstNameFrom } from "./greeting";

// 2026-07-07T13:00:00Z == 09:00 ET (morning)
test("morning before noon ET", () => {
  expect(greetingFor(new Date("2026-07-07T13:00:00Z"))).toBe("Good morning");
});
// 2026-07-07T17:00:00Z == 13:00 ET (afternoon)
test("afternoon from noon", () => {
  expect(greetingFor(new Date("2026-07-07T17:00:00Z"))).toBe("Good afternoon");
});
// 2026-07-08T01:00:00Z == 21:00 ET (evening)
test("evening from 17:00", () => {
  expect(greetingFor(new Date("2026-07-08T01:00:00Z"))).toBe("Good evening");
});
test("firstName prefers name, falls back to email local part", () => {
  expect(firstNameFrom("Ada Marie Lindqvist", "x@example.com")).toBe("Ada");
  expect(firstNameFrom(null, "tom.keller@example.com")).toBe("Tom");
  expect(firstNameFrom("ADA LINDQVIST", "x@example.com")).toBe("Ada");
});
