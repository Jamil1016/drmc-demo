import { test, expect } from "@playwright/test";
import { logActivity } from "./audit";

// Minimal stub matching the .schema(...).from(...).insert(...) chain we use.
function stubClient(onInsert: (payload: unknown) => Promise<{ error: unknown }>) {
  return {
    schema: () => ({ from: () => ({ insert: (payload: unknown) => onInsert(payload) }) }),
  } as unknown as Parameters<typeof logActivity>[1];
}

test("inserts a normalized audit row", async () => {
  let captured: unknown = null;
  const svc = stubClient(async (p) => { captured = p; return { error: null }; });
  await logActivity({ actorEmail: "a@example.com", action: "x.do", entity: "thing", entityId: "42", detail: { n: 1 } }, svc);
  expect(captured).toEqual({ actor_email: "a@example.com", action: "x.do", entity: "thing", entity_id: "42", detail: { n: 1 } });
});

test("defaults entity_id and detail to null when omitted", async () => {
  let captured: unknown = null;
  const svc = stubClient(async (p) => { captured = p; return { error: null }; });
  await logActivity({ actorEmail: "a@example.com", action: "auth.sign_in", entity: "auth" }, svc);
  const row = captured as Record<string, unknown> | null;
  expect(row?.entity_id).toBe(null);
  expect(row?.detail).toBe(null);
});

test("never throws when the insert fails", async () => {
  const svc = stubClient(async () => { throw new Error("db down"); });
  await logActivity({ actorEmail: "a@example.com", action: "x.do", entity: "thing" }, svc); // must resolve
  expect(true).toBe(true);
});
