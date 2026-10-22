import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.join(import.meta.dirname, '..');

/** Files under src/ that the web server imports, also through each other. */
function sharedImports(): string[] {
  const seen = new Set<string>();
  const visit = (file: string) => {
    const source = readFileSync(path.join(root, file), 'utf8');
    for (const [, spec] of source.matchAll(/from '(\.{1,2}\/[^']+)'/g)) {
      const target = path.relative(root, path.join(root, path.dirname(file), spec));
      if (target.startsWith('src/') && !seen.has(target)) {
        seen.add(target);
        visit(target);
      }
    }
  };
  for (const name of readdirSync(path.join(root, 'server'))) {
    if (name.endsWith('.ts') && !name.endsWith('.test.ts')) visit(`server/${name}`);
  }
  return [...seen].sort();
}

describe('Docker image of the web server', () => {
  // The runtime stage copies server/ and single files from src/; a missing one only
  // shows when the container starts (ERR_MODULE_NOT_FOUND), after CI and E2E passed
  it('contains every file from src/ that the server imports', () => {
    const dockerfile = readFileSync(path.join(root, 'Dockerfile'), 'utf8');
    const copied = [...dockerfile.matchAll(/^COPY (src\/\S+) /gm)].map((match) => match[1]);
    const imports = sharedImports();
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((file) => !copied.includes(file))).toEqual([]);
  });
});
