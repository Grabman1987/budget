import { test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as prettier from 'prettier';

test('format the four changed 558 files, then run scoped lint and unit checks', async () => {
  const paths = [
    'apps/web/src/pwa/pwa.tsx',
    'apps/web/src/pwa/snapshots.ts',
    'apps/web/src/pwa/pwa.test.tsx',
    'e2e/issue-558-offline-last-state.spec.ts',
  ];
  for (const path of paths) {
    const text = readFileSync(path, 'utf8');
    const options = await prettier.resolveConfig(path);
    writeFileSync(path, await prettier.format(text, { ...options, filepath: path }));
  }
  const patch = execFileSync('git', ['diff', '--', ...paths], { encoding: 'utf8' });
  const hash = createHash('sha256').update(patch).digest('hex');
  writeFileSync('e2e/format-558-output.txt', patch);
  console.log('FORMAT558_SHA256=' + hash);
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
});
