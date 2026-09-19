import { test, expect } from "@playwright/test";
import { canAdoptPolledRows } from "./poll-sync";

test("page 1 only, idle: adopt", () => {
  expect(canAdoptPolledRows({ offset: 100, pageSize: 100, loadingMore: false })).toBe(true);
});

test("short first page (fewer rows than a full page): adopt", () => {
  expect(canAdoptPolledRows({ offset: 37, pageSize: 100, loadingMore: false })).toBe(true);
});

test("user has infinite-scrolled past page 1: never clobber", () => {
  expect(canAdoptPolledRows({ offset: 200, pageSize: 100, loadingMore: false })).toBe(false);
});

test("a page fetch is in flight: skip this tick", () => {
  expect(canAdoptPolledRows({ offset: 100, pageSize: 100, loadingMore: true })).toBe(false);
});

test("busy (e.g. a resort fetch is in flight): skip this tick", () => {
  expect(canAdoptPolledRows({ offset: 100, pageSize: 100, loadingMore: false, busy: true })).toBe(false);
});
