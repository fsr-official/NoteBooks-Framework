import { defineConfig } from "@playwright/test";

const host = "127.0.0.1";
const port = 3217;
const baseURL = `http://${host}:${port}`;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.pw.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  outputDir: "./playwright-results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    browserName: "chromium",
    channel: "chrome",
    headless: true,
  },
  webServer: {
    command: `pnpm exec next dev --hostname ${host} --port ${port}`,
    cwd: "..",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1",
      NOTEBOOKS_C2_FIXTURE: "1",
      TRUSTED_MDX_REPOSITORIES: "notebooks-c2-fixture/read-c2-fixture",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3218",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_test_only",
      SUPABASE_URL: "http://127.0.0.1:3218",
      SUPABASE_SERVICE_ROLE_KEY: "",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
    },
  },
});
