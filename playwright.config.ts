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
// Support both standard and preview deploy keys
const cloudKey = process.env.CONVEX_DEPLOY_KEY || process.env.CONVEX_PREVIEW_DEPLOY_KEY;
const hasCloudKey = !!cloudKey;
const isSelfHosted = process.env.CONVEX_SELF_HOSTED === 'true';
const convexUrl = process.env.VITE_CONVEX_URL || process.env.CONVEX_URL || '';
const isLocalConvex = convexUrl.includes('127.0.0.1') || convexUrl.includes('localhost');
const frontendCommand = convexUrl
  ? `VITE_CONVEX_URL=${convexUrl} npm run dev -- --host 127.0.0.1 --port 5173`
  : 'npm run dev -- --host 127.0.0.1 --port 5173';

if (isCI) {
  console.log('🚀 Running in CI mode');
  console.log('🔗 Convex URL:', convexUrl);
  console.log('🔑 Cloud Key present:', hasCloudKey);

  // 1. Basic check: CI must have a deployment method defined
  if (!hasCloudKey && !isSelfHosted) {
    throw new Error(
      'CI environment detected but no deployment key or CONVEX_SELF_HOSTED flag set. Please set one of these to avoid accidentally running tests against production.'
    );
  }

  // 2. Safety check for self-hosted mode: Must point to local address in CI unless a cloud key is specifically provided
  if (isSelfHosted && !isLocalConvex && !hasCloudKey) {
    throw new Error(
      `Security Halt: CONVEX_SELF_HOSTED is active, but CONVEX_URL ("${convexUrl}") does not point to a local address. To prevent accidental production access, CI tests must use local backends unless a cloud key is present.`
    );
  }
}

// Map key for Convex CLI if using preview key
if (process.env.CONVEX_PREVIEW_DEPLOY_KEY && !process.env.CONVEX_DEPLOY_KEY) {
  process.env.CONVEX_DEPLOY_KEY = process.env.CONVEX_PREVIEW_DEPLOY_KEY;
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
