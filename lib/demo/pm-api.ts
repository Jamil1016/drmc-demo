import { PmApiHttpError, type PmApiHttpLite } from "@/lib/pm-api/approve";
import type { PmApiSession } from "@/lib/pm-api/login";

/**
 * Simulated project-management API, behind the same HTTP port the approval
 * code was written against (lib/pm-api/approve.ts). It behaves like the real
 * thing in the ways the calling code cares about:
 *
 *   - every call takes 150-400 ms;
 *   - approving is idempotent: a PATCH on a task that is already approved is
 *     answered with a 403, and a GET then reports "approved", which the caller
 *     turns into a quiet "already approved" success;
 *   - it can have an outage: the first `outageItems` distinct tasks it is asked
 *     to approve get a 503 on every attempt, so the retry ladder runs out and
 *     the batch records them as retryable failures.
 *
 * It holds no state of its own. "Is this task approved?" is answered by the
 * caller-supplied `statusOf`, which reads the same serving view the pages read,
 * so the simulation can never disagree with what the visitor sees.
 */
export type SimulatedPmApiOptions = {
  statusOf: (taskDid: string) => Promise<string | null>;
  /** How many distinct tasks should hit the simulated outage. Default 0. */
  outageItems?: number;
  /** Injectable for tests. Defaults to a real 150-400 ms wait. */
  latency?: () => Promise<void>;
};

const TASK_STATUS_RE = /^\/tasks\/([^/]+)\/status$/;
const TASK_RE = /^\/tasks\/([^/]+)$/;

const defaultLatency = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 150 + Math.floor(Math.random() * 251)));

export function createSimulatedPmApi(opts: SimulatedPmApiOptions): PmApiHttpLite & { outageHits: () => number } {
  const latency = opts.latency ?? defaultLatency;
  const outageBudget = Math.max(0, opts.outageItems ?? 0);
  const inOutage = new Set<string>();

  return {
    outageHits: () => inOutage.size,

    async patchJson(url, idToken, body) {
      await latency();
      if (!idToken) throw new PmApiHttpError(401, "Missing token.");
      const m = TASK_STATUS_RE.exec(url);
      if (!m) throw new PmApiHttpError(404, "Unknown resource.");
      const taskDid = decodeURIComponent(m[1]);
      if ((body as { status?: unknown })?.status !== "approved") {
        throw new PmApiHttpError(400, "Only status=approved is supported.");
      }
      if (inOutage.has(taskDid) || inOutage.size < outageBudget) {
        inOutage.add(taskDid);
        throw new PmApiHttpError(503, "Simulated outage.");
      }
      const status = (await opts.statusOf(taskDid))?.toLowerCase() ?? null;
      if (status === null) throw new PmApiHttpError(404, "No such task.");
      if (status === "approved") throw new PmApiHttpError(403, "Provided status is the current status.");
      if (status !== "submitted") throw new PmApiHttpError(409, "Task is not awaiting approval.");
      return { item: { status: "approved" } };
    },

    async getJson(url, idToken) {
      await latency();
      if (!idToken) throw new PmApiHttpError(401, "Missing token.");
      const m = TASK_RE.exec(url);
      if (!m) throw new PmApiHttpError(404, "Unknown resource.");
      const status = await opts.statusOf(decodeURIComponent(m[1]));
      if (status === null) throw new PmApiHttpError(404, "No such task.");
      return { item: { status } };
    },
  };
}

/**
 * Simulated login. The demo user is treated as already connected: there is no
 * credential form anywhere in this build (a visitor could type a real password
 * into one), so nothing is asked for and nothing is stored. The token is an
 * unsigned, in-memory placeholder with a 30 minute expiry so the session cache
 * (lib/pm-api/session-cache.ts) behaves as it does against a real token.
 */
export async function simulatedPmApiLogin(email: string): Promise<PmApiSession> {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 30 * 60;
  return { idToken: `${b64({ alg: "none" })}.${b64({ sub: email, exp })}.simulated`, user: email };
}
