import { execSync } from 'node:child_process';

/**
 * Executes a Convex command via the CLI, automatically adding --preview-name if present.
 * @param command The convex command to run (e.g., 'run seed:toggleFeatureFlag')
 * @param args Optional arguments for the command
 */
export function runConvexCommand(command: string, args: string = '') {
  const usePreview = process.env.CI === 'true' || process.env.PLAYWRIGHT_USE_PREVIEW === 'true';
  const previewName = process.env.CONVEX_PREVIEW_NAME;
  const previewArg = usePreview && previewName ? `--preview-name ${previewName}` : '';
  const env = { ...process.env };

  if (!env.CONVEX_DEPLOY_KEY && env.CONVEX_PREVIEW_DEPLOY_KEY) {
    env.CONVEX_DEPLOY_KEY = env.CONVEX_PREVIEW_DEPLOY_KEY;
  }

  // Construct the full command
  // convex run [preview-arg] functionName [args]
  const fullCommand = `npx convex ${command} ${previewArg} ${args}`.trim();

  console.log(`Executing: ${fullCommand}`);

  return execSync(fullCommand, {
    stdio: 'inherit',
    env,
  });
}

/**
 * Executes a Convex command and returns stdout as string.
 */
export function runConvexCommandWithOutput(command: string, args: string = '') {
  const usePreview = process.env.CI === 'true' || process.env.PLAYWRIGHT_USE_PREVIEW === 'true';
  const previewName = process.env.CONVEX_PREVIEW_NAME;
  const previewArg = usePreview && previewName ? `--preview-name ${previewName}` : '';
  const env = { ...process.env };

  if (!env.CONVEX_DEPLOY_KEY && env.CONVEX_PREVIEW_DEPLOY_KEY) {
    env.CONVEX_DEPLOY_KEY = env.CONVEX_PREVIEW_DEPLOY_KEY;
  }

  const fullCommand = `npx convex ${command} ${previewArg} ${args}`.trim();

  return execSync(fullCommand, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .toString('utf8')
    .trim();
}
