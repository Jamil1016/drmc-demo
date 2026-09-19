import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { authBypassEnabled } from "@/lib/demo/mode";
import { NO_REALTIME } from "@/lib/supabase/no-realtime";

/**
 * Session refresh, following the @supabase/ssr pattern. Server Components
 * cannot write cookies, so the refreshed token has to be written here, before
 * render.
 *
 * This does NOT gate access. Authorization lives in requireUser() /
 * requireMinRole() / assertMutationAllowed(), which every page, server action
 * and route handler calls itself.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || authBypassEnabled()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    realtime: NO_REALTIME,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  try {
    await supabase.auth.getUser();
  } catch {
    // Auth service unreachable: let the request through; the guards decide.
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|demo-attachments/|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
