import { execSync } from 'node:child_process';
import fs from 'fs';
import path from 'path';

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

async function globalTeardown() {
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
    await runWithRetries('npm run clearDB', 4, 3000);
    const backupDir = 'src/tests/backup';

    const file = fs
      .readdirSync(backupDir)
      .find((f) => f.startsWith('snapshot_') && f.endsWith('.zip'));
    const filePath = path.join(backupDir, `${file}`);
    console.log(`restoring ${filePath}`);

    if (!file) {
      throw new Error('Kein Backup gefunden');
    }
    await runWithRetries(
      `npx convex import --replace ${previewName ? `--preview-name ${previewName} ` : ''} ${filePath} -y`,
      4,
      3000
    );

    fs.rmSync(backupDir, { recursive: true, force: true });
  } catch (error) {
    console.error('Error during global teardown:', error);
  }
}
export default globalTeardown;
