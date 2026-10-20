import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// Load .env.local first and allow it to override existing environment variables
dotenv.config({ path: path.resolve(__dirname, '.env.local'), override: true });
dotenv.config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */

const isCI = !!process.env.CI;
const isSelfHosted = process.env.CONVEX_SELF_HOSTED === 'true';
const convexUrl = process.env.VITE_CONVEX_URL || process.env.CONVEX_URL || '';
const isLocalConvex = convexUrl.includes('127.0.0.1') || convexUrl.includes('localhost');
const frontendCommand = convexUrl
  ? `VITE_CONVEX_URL=${convexUrl} npm run dev -- --host 127.0.0.1 --port 5173`
  : 'npm run dev -- --host 127.0.0.1 --port 5173';

// The tests wipe and reseed the database. In CI they only ever run against the
// throwaway backend from scripts/ci/convex-backend.sh.
if (isCI) {
  console.log('🚀 Running in CI mode');
  console.log('🔗 Convex URL:', convexUrl);

  if (!isSelfHosted || !isLocalConvex) {
    throw new Error(
      `Security Halt: CI tests need a local self-hosted Convex backend (CONVEX_SELF_HOSTED=true, CONVEX_URL on 127.0.0.1), got "${convexUrl}". Start one with scripts/ci/convex-backend.sh.`
    );
  }
}

export default defineConfig({
  testDir: './src/tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['junit', { outputFile: 'test-results/junit.xml' }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: 'http://127.0.0.1:5173/',

    /* The app follows the browser language; the tests check the German texts */
    locale: 'de-DE',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  globalSetup: './src/tests/global-setup.ts',
  globalTeardown: './src/tests/global-teardown.ts',

  projects: [
    {
      name: 'auth',
      testMatch: 'auth.setup.ts',
    },

    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: 'public/*.spec.ts',
    },

    {
      name: 'auth chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: 'auth/*.spec.ts',
    },

    // Admin flows change shared data (event approval), so run them in one browser only
    {
      name: 'admin chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: 'admin/*.spec.ts',
    },

    ...(process.env.PLAYWRIGHT_FIREFOX !== 'false'
      ? [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
            testMatch: 'public/*.spec.ts',
          },
          {
            name: 'auth firefox',
            use: { ...devices['Desktop Firefox'] },
            testMatch: 'auth/*.spec.ts',
          },
        ]
      : []),

    ...(process.env.PLAYWRIGHT_WEBKIT === 'true'
      ? [
          {
            name: 'public webkit',
            use: { ...devices['Desktop Safari'] },
            testMatch: 'public/*.spec.ts',
          },
        ]
      : []),
  ],

  /* Run your local dev server before starting the tests */
  webServer: [
    {
      name: 'Frontend Server',
      command: frontendCommand,
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
