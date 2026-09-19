import { defineConfig } from "@playwright/test";

/**
 * End-to-end checks against the LOCAL verification stack (Docker Postgres +
 * PostgREST + the /rest/v1 gateway) with DEMO_AUTH_BYPASS_FOR_LOCAL_TESTS.
 * Not part of CI. See README, "Tests".
 *
 *   docker compose -f docker-compose.local.yml up -d && npm run db:apply
 *   node scripts/local/gateway.cjs            # terminal 2
 *   npx next dev -p 3117                      # terminal 3, with the local .env.local
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.e2e.ts",
  timeout: 300_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3117",
    viewport: { width: 1440, height: 900 },
    screenshot: "off",
  },
});
