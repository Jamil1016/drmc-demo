import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "test-results/**", "playwright-report/**", "next-env.d.ts"]),
  {
    // CommonJS helpers (scripts/local/*.cjs) use require() by nature.
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Scoped to the file types the Next configs above register plugins for:
    // an unscoped override also hits *.cjs (scripts/local/*.cjs), where
    // the react-hooks plugin is not defined and eslint hard-errors.
    files: ["**/*.{js,jsx,mjs,ts,tsx}"],
    rules: {
      // react-hooks v6 heuristics. They flag intentional, verified patterns in
      // about twenty places (LiveRefresh's latest-closure ref, the filter
      // components' pending refs, sync-on-open effects). The original app kept
      // them as visible warnings and linted without a warning ceiling; this
      // repo lints with --max-warnings 0, so they are switched off here rather
      // than rewriting working components to satisfy a heuristic.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      // Underscore prefix = intentionally unused (kept for signature shape).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
