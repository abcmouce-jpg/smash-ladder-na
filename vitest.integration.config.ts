import { defineConfig } from "vitest/config";
import path from "path";

// Separate local DB from dev's `smashladder` so integration tests can
// truncate freely between runs without wiping anyone's local dev data.
// In CI this points at the postgres service container instead (see
// .github/workflows/ci.yml).
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/smashladder_test";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.integration.test.ts"],
    // dotenv's config() (called from src/lib/db.ts) doesn't override
    // already-set process.env values by default, so setting these here
    // wins over whatever .env/.env.development would otherwise supply.
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_URL: TEST_DATABASE_URL,
      DATABASE_URL_POOLED: TEST_DATABASE_URL,
    },
    setupFiles: ["src/test/integration-setup.ts"],
    // Tests across files share one real database — running files in
    // parallel would race on truncation between them.
    fileParallelism: false,
  },
});
