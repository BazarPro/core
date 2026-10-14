import { execSync } from 'node:child_process';

/**
 * Executes a Convex command via the CLI against the test backend.
 * @param command The convex command to run (e.g., 'run seed:toggleFeatureFlag')
 * @param args Optional arguments for the command
 */
export function runConvexCommand(command: string, args: string = '') {
  const fullCommand = `npx convex ${command} ${args}`.trim();

  console.log(`Executing: ${fullCommand}`);

  return execSync(fullCommand, {
    stdio: 'inherit',
    env: process.env,
  });
}

/**
 * Executes a Convex command and returns stdout as string.
 */
export function runConvexCommandWithOutput(command: string, args: string = '') {
  const fullCommand = `npx convex ${command} ${args}`.trim();

  return execSync(fullCommand, {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .toString('utf8')
    .trim();
}
