/**
 * The email gate. The original app could send reminders and notices; every one
 * of those paths was removed from this build, and there is no mail transport
 * in the dependency tree. This module exists so the rule is stated in code and
 * pinned by a test: whatever the environment says, the mode is "off".
 */
export type EmailMode = "off";

export function emailMode(_env: Record<string, string | undefined> = process.env): EmailMode {
  return "off";
}
