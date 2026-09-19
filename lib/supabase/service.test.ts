import { test, expect } from "@playwright/test";

test("createServiceClient throws a clear error when key is missing", async () => {
  const prev = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { createServiceClient } = await import("./service");
  expect(() => createServiceClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  process.env.SUPABASE_SERVICE_ROLE_KEY = prev;
});
