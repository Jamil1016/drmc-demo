import { defineConfig } from "@playwright/test";
import { mintJwt } from "../../scripts/local/jwt.cjs";

/**
 * Integration tests: the app's real query layer and the real batch chunk
 * processor, through the real supabase-js client, against the real SQL in the
 * local Postgres + PostgREST stack (docker-compose.local.yml). Not part of CI.
 *
 *   docker compose -f docker-compose.local.yml up -d && npm run db:apply
 *   npm run test:db
 */
process.env.DEMO_MODE = "true";
process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${process.env.GATEWAY_PORT ?? 54341}`;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = mintJwt("anon");
process.env.SUPABASE_SERVICE_ROLE_KEY = mintJwt("service_role");
process.env.LOCAL_DATABASE_URL ??= "postgres://postgres:postgres@127.0.0.1:54339/postgres";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.dbtest.ts",
  globalSetup: "./global-setup.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  reporter: "list",
});
