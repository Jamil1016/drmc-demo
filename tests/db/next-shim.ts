// MUST be the first import of an integration test file.
//
// The query layer imports next/cache (unstable_cache). Outside a Next.js
// process two things it expects are missing, so provide inert stand-ins:
//   - globalThis.AsyncLocalStorage, which Next's bootstrap normally installs;
//   - an incremental cache. This one never hits, so every call runs the real
//     query against the real database, which is the point of these tests.
import { AsyncLocalStorage } from "node:async_hooks";

const g = globalThis as unknown as { AsyncLocalStorage?: unknown; __incrementalCache?: unknown };
g.AsyncLocalStorage ??= AsyncLocalStorage;
g.__incrementalCache = {
  isOnDemandRevalidate: false,
  generateCacheKey: async (key: string) => key,
  get: async () => null,
  set: async () => {},
};
