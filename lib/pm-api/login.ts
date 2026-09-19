/** A signed-in PM API session. The token lives only in memory, never persisted. */
export interface PmApiSession { idToken: string; user: string }

/** The login port: exchange an identity for a session. In this demo the only
 *  implementation is the simulated one in lib/demo/pm-api.ts. */
export type PmApiLogin = () => Promise<PmApiSession>;
