import { formatInTimeZone } from "date-fns-tz";

/** Time-of-day greeting computed in the given timezone (default Eastern). */
export function greetingFor(now: Date, tz = "America/New_York"): string {
  const hour = Number(formatInTimeZone(now, tz, "H"));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Display first name: the sign-in name if present, else the email local part, title-cased. */
export function firstNameFrom(name: string | null, email: string): string {
  const raw = name?.trim() ? name.trim().split(/\s+/)[0] : (email.split("@")[0].split(/[._-]/)[0] ?? "");
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : "there";
}
