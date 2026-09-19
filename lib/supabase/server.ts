import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NO_REALTIME } from "./no-realtime";

// User-JWT server client. Used ONLY for Supabase Auth (getUser, sign-in/out).
// App data is NOT reachable here (no grants to anon/authenticated on any
// drmc_* schema); use the service client for all data reads/writes.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: NO_REALTIME,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components cannot set cookies; safe to swallow.
          }
        },
      },
    }
  );
}
