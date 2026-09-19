import { test, expect } from "@playwright/test";
import { roleAtLeast, canApprove, ALL_ROLES, ROLE_RANK } from "./roles";
import type { AppRole } from "./roles";

test("roleAtLeast honors viewer < lead < manager < hr_staff < super_admin", () => {
  expect(roleAtLeast("lead", "viewer")).toBe(true);
  expect(roleAtLeast("manager", "lead")).toBe(true);
  expect(roleAtLeast("hr_staff", "manager")).toBe(true);
  expect(roleAtLeast("super_admin", "hr_staff")).toBe(true);
  expect(roleAtLeast("lead", "manager")).toBe(false);
  expect(roleAtLeast("viewer", "lead")).toBe(false);
});

test("the new manager tier clears manager gates but not hr_staff gates", () => {
  expect(roleAtLeast("manager", "manager")).toBe(true);
  expect(roleAtLeast("manager", "hr_staff")).toBe(false);
  expect(roleAtLeast("manager", "super_admin")).toBe(false);
});

test("lead reaches the approver gates but no HR surface", () => {
  expect(roleAtLeast("lead", "lead")).toBe(true);
  expect(roleAtLeast("lead", "manager")).toBe(false);
  expect(roleAtLeast("lead", "hr_staff")).toBe(false);
});

test("roleAtLeast for the hr_staff+ gate (employee/org CRUD, HR Dashboard)", () => {
  expect(roleAtLeast("super_admin", "hr_staff")).toBe(true);
  expect(roleAtLeast("hr_staff", "hr_staff")).toBe(true);
  expect(roleAtLeast("manager", "hr_staff")).toBe(false);
  expect(roleAtLeast("lead", "hr_staff")).toBe(false);
  expect(roleAtLeast("viewer", "hr_staff")).toBe(false);
});

test("roleAtLeast for the super_admin gate (only super_admin)", () => {
  expect(roleAtLeast("super_admin", "super_admin")).toBe(true);
  expect(roleAtLeast("hr_staff", "super_admin")).toBe(false);
});

test("canApprove = lead and up (viewer excluded)", () => {
  expect(canApprove("super_admin")).toBe(true);
  expect(canApprove("hr_staff")).toBe(true);
  expect(canApprove("manager")).toBe(true);
  expect(canApprove("lead")).toBe(true);
  expect(canApprove("viewer")).toBe(false);
});

test("ALL_ROLES covers every ROLE_RANK key, ordered by non-decreasing rank", () => {
  expect([...ALL_ROLES].sort()).toEqual(Object.keys(ROLE_RANK).sort());
  const ranks = ALL_ROLES.map((r) => ROLE_RANK[r]);
  expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
});

test("roleAtLeast fails closed on a role it does not recognize", () => {
  // ROLE_RANK[unknown] is undefined and `undefined >= n` is false, so an
  // unrecognized role clears NO gate, not even viewer. A two-deploy role
  // rename depends on this: the app has to learn a new role name BEFORE any
  // row is renamed to it.
  expect(roleAtLeast("bogus" as AppRole, "viewer")).toBe(false);
  expect(roleAtLeast("bogus" as AppRole, "super_admin")).toBe(false);
});
