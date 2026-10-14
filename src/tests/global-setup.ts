import { execSync } from 'node:child_process';
import fs from 'fs';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithRetries(command: string, attempts: number, delayMs: number) {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      execSync(command, { stdio: 'inherit', env: process.env });
      return;
    } catch (error) {
      lastError = error;
      if (i < attempts) {
        console.warn(
          `⚠️ ${command} failed (attempt ${i}/${attempts}). Retrying in ${delayMs}ms...`
        );
        await sleep(delayMs);
      }
    }
  }
  throw lastError;
}

async function globalSetup() {
  try {
    const backupDir = 'src/tests/backup';

    fs.mkdirSync(backupDir, { recursive: true });
    await runWithRetries('npx convex export --path src/tests/backup', 4, 3000);
    await runWithRetries('npm run clearDB', 4, 3000);
    await runWithRetries('npm run seed', 4, 3000);
    // Never send real emails from E2E runs (sale, offer and question notifications)
    await runWithRetries(
      `npx convex run ${process.env.PREVIEW_NAME_ARG ?? ''} featureFlags:set "{ 'key':'is_e2e_auth_skip_email', 'value': true }"`,
      4,
      3000
    );
  } catch (error) {
    console.error('❌ Database setup failed');
    throw error;
  }
}
export default globalSetup;
