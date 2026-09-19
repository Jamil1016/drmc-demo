import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NO_REALTIME } from "./no-realtime";

// Service-role client. BYPASSES RLS. Every data read/write goes through this,
// gated by a server-side auth + allowlist check (requireUser / requireMinRole).
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local for local dev.");
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: NO_REALTIME,
  });
}
