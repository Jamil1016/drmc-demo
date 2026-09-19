import { cookies } from "next/headers";
import { DISPLAY_ZONE_COOKIE, parseDisplayZone, type DisplayZone } from "@/lib/time";

/**
 * The signed-in user's timestamp display zone, read from the preference cookie.
 * Server components use this to render timestamps in the same zone the client
 * provider is seeded with, so first paint matches and nothing flashes.
 * Server-only (imports next/headers): never import from a client component.
 */
export async function getDisplayZone(): Promise<DisplayZone> {
  return parseDisplayZone((await cookies()).get(DISPLAY_ZONE_COOKIE)?.value);
}
