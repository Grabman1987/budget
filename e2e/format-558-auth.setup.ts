import type { FullConfig } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import * as prettier from 'prettier';

export default async function globalSetup(config: FullConfig) {
  if (config.updateSnapshots !== 'none') {
    throw new Error(`Refusing auth regression run with updateSnapshots=${config.updateSnapshots}`);
  }
  console.log('GLOBAL_UPDATE_SNAPSHOTS=none');
  const paths = ['apps/web/src/api/http.ts', 'apps/web/src/pwa/pwa.tsx'];
  for (const path of paths) {
    const source = readFileSync(path, 'utf8');
    const options = await prettier.resolveConfig(path);
    writeFileSync(path, await prettier.format(source, { ...options, filepath: path }));
  }
  const patch = execFileSync('git', ['diff', '--', ...paths], { encoding: 'utf8' });
  const hash = createHash('sha256').update(patch).digest('hex');
  writeFileSync('e2e/format-558-output.txt', patch);
  console.log(`FORMAT558_SHA256=${hash}`);
  execFileSync(process.execPath, [
    'node_modules/eslint/bin/eslint.js',
    ...paths,
  ], { stdio: 'inherit' });
  execFileSync(process.execPath, [
    'node_modules/vitest/vitest.mjs',
    'run',
    '--config=vitest.config.ts',
    'apps/web/src/auth/stale-after-write.test.ts',
    'apps/web/src/pwa/pwa.test.tsx',
    'apps/web/src/pwa/local-data.test.ts',
    'apps/web/src/api/offline-write-558.test.ts',
    'apps/web/src/pwa/snapshots-558.test.ts',
  ], { stdio: 'inherit' });
}
