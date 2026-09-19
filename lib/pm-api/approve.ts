import type { PmApiSession } from "./login";
import { isTransientPmApiFailure } from "@/lib/hr/domain/bulk-approve";

/**
 * The HTTP port to the project-management system ("PM API"). Everything that
 * approves a report talks to this interface, never to fetch() directly, which
 * is what lets the retry / idempotency logic be unit tested with a fake and
 * lets this demo run on a simulated implementation (lib/demo/pm-api.ts).
 * There is deliberately no network implementation in this codebase.
 */
export class PmApiHttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; this.name = "PmApiHttpError"; }
}

export interface PmApiHttpLite {
  patchJson(url: string, idToken: string, body: unknown): Promise<unknown>;
  getJson(url: string, idToken: string): Promise<unknown>;
}

/** Resource paths on the port. The simulated implementation parses these. */
export const pmApiTaskStatusPath = (taskDid: string) => `/tasks/${taskDid}/status`;
export const pmApiTaskPath = (taskDid: string) => `/tasks/${taskDid}`;

const errInfo = (e: unknown): { httpStatus?: number; reason: string } =>
  e instanceof PmApiHttpError
    ? { httpStatus: e.status, reason: e.status === 403 ? "Your PM API account can't perform this action." : `PM API error (${e.status}).` }
    : { reason: e instanceof Error ? e.message : "Unknown error." };

/** The task's own current status in the PM API ("submitted", "approved", ...),
 *  or null when it can't be read. Never throws: this is a best-effort probe. */
export async function fetchTaskStatus(
  http: PmApiHttpLite, session: PmApiSession, taskDid: string,
): Promise<string | null> {
  try {
    const body = await http.getJson(pmApiTaskPath(taskDid), session.idToken);
    const status = (body as { item?: { status?: unknown } })?.item?.status;
    return typeof status === "string" ? status : null;
  } catch { return null; }
}

export type ApproveOutcome =
  | { ok: true; alreadyApproved?: true }
  | { ok: false; httpStatus?: number; reason: string };

/**
 * Flip a task to approved. Safe to retry (no upload).
 *
 * The PM API answers a PATCH on a task that is ALREADY approved with a 403,
 * indistinguishable by status code from a real permission error. So on any
 * terminal (non-retryable) failure we read the task back: if it says approved,
 * the desired end state is reached and this reports success with
 * `alreadyApproved` set, instead of a scary permission error for a report
 * someone simply approved first.
 */
export async function approveTaskInPmApi(
  http: PmApiHttpLite, session: PmApiSession, taskDid: string,
): Promise<ApproveOutcome> {
  try {
    await http.patchJson(pmApiTaskStatusPath(taskDid), session.idToken, { status: "approved" });
    return { ok: true };
  } catch (e) {
    const info = errInfo(e);
    // 401 is the caller's session-refresh signal and transient errors will be
    // retried; only terminal failures are worth the verification read.
    const terminal = info.httpStatus !== undefined && info.httpStatus !== 401
      && !isTransientPmApiFailure(info.httpStatus);
    if (terminal) {
      const status = await fetchTaskStatus(http, session, taskDid);
      if (status?.toLowerCase() === "approved") return { ok: true, alreadyApproved: true };
    }
    return { ok: false, ...info };
  }
}
