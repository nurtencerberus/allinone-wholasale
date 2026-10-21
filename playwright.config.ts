import { defineConfig, devices } from "@playwright/test";

/**
 * DEV-1: the browser tests.
 *
 * The suites in tests/e2e drive the app over HTTP: they prove the routes, the business rules and
 * what reaches the database. Nothing in them runs a browser, so the parts of the shop that only
 * exist in one — the cart drawer, the checkout wizard, the sign-in and two-factor screens, the
 * focus trap — were never executed before a buyer executed them. These tests do that, and fail on
 * any uncaught client error or hydration mismatch they meet on the way (tests/browser/fixtures.ts).
 *
 * They expect a server that is already running (BASE) on the same disposable demo database the
 * HTTP suites use; .github/workflows/ci.yml starts it once for both.
 */
export default defineConfig({
  testDir: "./tests/browser",
  // One worker, no parallelism: the specs share one database and move real stock through it.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: "test-results",
  use: {
    baseURL: process.env.BASE ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    locale: "en-US",
    timezoneId: "America/New_York",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
