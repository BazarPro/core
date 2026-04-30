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
  const usePreview = process.env.CI === 'true' || process.env.PLAYWRIGHT_USE_PREVIEW === 'true';

  if (!process.env.CONVEX_DEPLOY_KEY && process.env.CONVEX_PREVIEW_DEPLOY_KEY) {
    process.env.CONVEX_DEPLOY_KEY = process.env.CONVEX_PREVIEW_DEPLOY_KEY;
  }

  const previewName = process.env.CONVEX_PREVIEW_NAME;

  if (usePreview && previewName) {
    process.env.PREVIEW_NAME_ARG = `--preview-name ${previewName}`;
  } else {
    delete process.env.PREVIEW_NAME_ARG;
  }

  try {
    const backupDir = 'src/tests/backup';

    fs.mkdirSync(backupDir, { recursive: true });
    await runWithRetries(
      `npx convex export ${previewName ? `--preview-name ${previewName} ` : ''}--path src/tests/backup`,
      4,
      3000
    );
    await runWithRetries('npm run clearDB', 4, 3000);
    await runWithRetries('npm run seed', 4, 3000);
  } catch (error) {
    console.error('❌ Database setup failed');
    throw error;
  }
}
export default globalSetup;
