/**
 * Visitors to the demo all share one account, so the set of things that can
 * change data is a closed allowlist. Every mutating server action names itself
 * with one of these kinds and goes through assertMutationAllowed()
 * (lib/auth/require-user.ts); anything not listed here is refused.
 *
 * Pure and client-safe so it can be unit tested without a session.
 */
export const ALLOWED_DEMO_MUTATIONS = [
  "approval.approve",
  "approval.batch.start",
  "approval.batch.process",
  "approval.batch.retry",
] as const;

export type DemoMutation = (typeof ALLOWED_DEMO_MUTATIONS)[number];

export function isAllowedDemoMutation(kind: string): kind is DemoMutation {
  return (ALLOWED_DEMO_MUTATIONS as readonly string[]).includes(kind);
}

export const DEMO_MUTATION_REFUSED = "This action is disabled in the demo.";
