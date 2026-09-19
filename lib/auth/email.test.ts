import { test, expect } from "@playwright/test";
import { normalizeEmail } from "./email";

test("normalizeEmail lowercases and trims", () => {
  expect(normalizeEmail("  Ada.Lindqvist@example.com ")).toBe("ada.lindqvist@example.com");
});

test("normalizeEmail returns empty string for falsy", () => {
  expect(normalizeEmail(null)).toBe("");
  expect(normalizeEmail(undefined)).toBe("");
  expect(normalizeEmail("")).toBe("");
});
