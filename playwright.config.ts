import { defineConfig } from "@playwright/test";

// Unit tests: pure TypeScript, no browser and no database. They run under
// Playwright's test runner (npm test). The database integration tests and the
// browser end-to-end tests have their own configs under tests/.
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.test.ts",
  testIgnore: ["**/node_modules/**", "tests/**"],
  reporter: "list",
});
