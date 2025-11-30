import { defineConfig, devices } from "@playwright/test"

const apiPort = process.env.JF_E2E_API_PORT || "5080"
const apiOrigin = `http://127.0.0.1:${apiPort}`
const apiBaseUrl = `${apiOrigin}/api`
// Use dev-admin-token which is recognized by the backend in test mode
const authToken = process.env.JF_E2E_AUTH_TOKEN || "dev-admin-token"
const ownerEmail = process.env.JF_E2E_OWNER_EMAIL || "dev-admin@jobfinder.dev"
const frontendBaseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173"

process.env.JF_E2E_API_BASE = process.env.JF_E2E_API_BASE || apiBaseUrl
process.env.JF_E2E_AUTH_TOKEN = authToken
process.env.JF_E2E_OWNER_EMAIL = ownerEmail

/**
 * Playwright E2E Testing Configuration
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./e2e",

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Use fewer workers for stability with SQLite backend */
  workers: process.env.CI ? 2 : 2,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [
        ["html", { open: "never" }],
        ["list"],
        ["json", { outputFile: "playwright-report/results.json" }],
        ["junit", { outputFile: "playwright-report/junit.xml" }],
      ]
    : [
        ["html"],
        ["list"],
        ["json", { outputFile: "playwright-report/results.json" }],
      ],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: frontendBaseUrl,
    headless: true,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    /* Screenshot on failure */
    screenshot: "only-on-failure",

    /* Video on failure */
    video: "retain-on-failure",

    /* Timeout settings for faster failure detection */
    actionTimeout: 5000,
    navigationTimeout: 10000,
  },

  /* Global test timeout */
  timeout: 60000,

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      command: [
        "cd ..",
        `LOG_LEVEL=warn JF_E2E_API_PORT=${apiPort} JF_E2E_AUTH_TOKEN=${authToken} node scripts/dev/start-api-e2e.mjs`,
      ].join(" && "),
      url: `${apiOrigin}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: [
        "cd ..",
        [
          `VITE_AUTH_BYPASS=true`,
          `VITE_ENVIRONMENT=development`,
          `VITE_E2E_AUTH_TOKEN=${authToken}`,
          `VITE_OWNER_EMAIL=${ownerEmail}`,
          `VITE_API_BASE_URL=${apiOrigin}`,
          `VITE_FUNCTIONS_BASE_URL=${apiOrigin}`,
          `VITE_GOOGLE_OAUTH_CLIENT_ID=test-google-client`,
          `VITE_FIREBASE_API_KEY=test-api-key`,
          `VITE_FIREBASE_AUTH_DOMAIN=test.local`,
          `VITE_FIREBASE_PROJECT_ID=job-finder-e2e`,
          `VITE_FIREBASE_STORAGE_BUCKET=test.appspot.com`,
          `VITE_FIREBASE_MESSAGING_SENDER_ID=999999999`,
          `VITE_FIREBASE_APP_ID=test-app-id`,
          `VITE_RECAPTCHA_SITE_KEY=test-recaptcha`,
          "npm run dev --workspace job-finder-FE",
        ].join(" "),
      ].join(" && "),
      url: frontendBaseUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
})
