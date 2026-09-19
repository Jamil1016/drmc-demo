import { test, expect } from "@playwright/test";
import { resolveTeamMembers, pickTeamMembers } from "./team-members";

// "Team members" for an approver = the people the roster assigns them to
// approve, falling back to the distinct people they have personally approved
// when the roster lists no one. The tile
// links to those same people via /directory?approver=<email>.

test("roster-assigned approver -> assigned count, links to the approver's directory slice", () => {
  const t = resolveTeamMembers(33, true, "own", 109, "omar.said@example.com");
  expect(t.value).toBe(33);
  expect(t.label).toBe("Members you approve");
  expect(t.href).toBe("/directory?approver=omar.said%40example.com");
});

test("roster-assigned approver with no approval history (scope none) still gets the tile", () => {
  const t = resolveTeamMembers(12, true, "none", 109, "fiona.dale@example.com");
  expect(t.value).toBe(12);
  expect(t.label).toBe("Members you approve");
  expect(t.href).toBe("/directory?approver=fiona.dale%40example.com");
});

test("roster-assigned super_admin (org scope) sees their own assignments, not the org roster", () => {
  const t = resolveTeamMembers(5, true, "org", 109, "lena.brandt@example.com");
  expect(t.value).toBe(5);
  expect(t.label).toBe("Members you approve");
});

test("history fallback: own approver -> approved-people count, same link shape", () => {
  const t = resolveTeamMembers(11, false, "own", 109, "lena.brandt@example.com");
  expect(t.value).toBe(11);
  expect(t.label).toBe("Members you approve");
  expect(t.href).toBe("/directory?approver=lena.brandt%40example.com");
});

test("history fallback count is used verbatim even when it exceeds a single team", () => {
  const t = resolveTeamMembers(63, false, "own", 109, "lead@example.com");
  expect(t.value).toBe(63);
  expect(t.href).toBe("/directory?approver=lead%40example.com");
});

test("own approver with an unavailable count (RPC error) -> roster placeholder, no invented number", () => {
  const t = resolveTeamMembers(null, false, "own", 109, "lena.brandt@example.com");
  expect(t.value).toBe(109);
  expect(t.label).toBe("Team members");
  expect(t.href).toBe("/directory");
});

test("own approver, failed roster fetch placeholder passes through", () => {
  const t = resolveTeamMembers(null, false, "own", "—", "lena.brandt@example.com");
  expect(t.value).toBe("—");
  expect(t.href).toBe("/directory");
});

test("org scope (super_admin) without assignments -> roster total labelled all groups", () => {
  const t = resolveTeamMembers(null, false, "org", 109, "admin@example.com");
  expect(t.value).toBe(109);
  expect(t.label).toBe("Team members (all groups)");
  expect(t.href).toBe("/directory");
});

test("none scope without assignments -> plain roster total", () => {
  const t = resolveTeamMembers(null, false, "none", 109, "user@example.com");
  expect(t.value).toBe(109);
  expect(t.label).toBe("Team members");
  expect(t.href).toBe("/directory");
});

// Assignment-first selection: the roster wins whenever it lists anyone;
// approval history is only the fallback. Both RPCs are fetched in parallel,
// so this pure picker is the single place the precedence lives.

test("roster assignments win over approval history", () => {
  expect(pickTeamMembers(["e1", "e2"], ["e3"])).toEqual({ ids: ["e1", "e2"], assigned: true });
});

test("empty assignments fall back to approval history", () => {
  expect(pickTeamMembers([], ["e3", "e4"])).toEqual({ ids: ["e3", "e4"], assigned: false });
});

test("both empty: empty history fallback (tile shows roster placeholder downstream)", () => {
  expect(pickTeamMembers([], [])).toEqual({ ids: [], assigned: false });
});
