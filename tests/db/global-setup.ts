import { startGateway } from "../../scripts/local/gateway.cjs";

/** supabase-js calls <url>/rest/v1; PostgREST serves at /. Start the tiny
 *  prefix-stripping proxy for the duration of the run, unless one is already
 *  listening (e.g. started by hand for the end-to-end tests). */
export default async function globalSetup() {
  try {
    const server = await startGateway(Number(process.env.GATEWAY_PORT ?? 54341));
    return async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EADDRINUSE") return async () => {};
    throw e;
  }
}
