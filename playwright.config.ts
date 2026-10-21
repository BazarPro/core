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

/**
 * The tests wipe and reseed their database, so they get one of their own: by default
 * bazarpro_e2e on the local Postgres of backend/docker-compose.dev.yml. Its name has to
 * end in _e2e or _test, so a development or production database is never wiped.
 */
const databaseUrl =
  process.env.E2E_DATABASE_URL ?? 'postgres://bazarpro:bazarpro@127.0.0.1:55432/bazarpro_e2e';
if (!/_(e2e|test)(\?|$)/.test(new URL(databaseUrl).pathname + new URL(databaseUrl).search)) {
  throw new Error(
    `Security Halt: E2E_DATABASE_URL must name a database ending in _e2e or _test, got "${databaseUrl}".`
  );
}
const backendPort = process.env.E2E_BACKEND_PORT ?? '3100';
// The backend CLI and server of the tests use the same settings
process.env.DATABASE_URL = databaseUrl;
process.env.ALLOW_REMOVE_ALL_DATA = 'true';
process.env.SITE_URL = 'http://127.0.0.1:5173';
process.env.STORAGE_DIR ??= 'test-results/e2e-files';
process.env.LISTEN_ADDR = `127.0.0.1:${backendPort}`;
process.env.BACKEND_URL = `http://127.0.0.1:${backendPort}`;
if (isCI) console.log('🚀 Running in CI mode');

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
      name: 'Backend',
      command: process.env.BACKEND_CLI
        ? process.env.BACKEND_CLI
        : 'cargo build --manifest-path backend/Cargo.toml && backend/target/debug/bazarpro-backend',
      url: `http://127.0.0.1:${backendPort}/healthz`,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      name: 'Frontend Server',
      command: 'npm run dev -- --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
