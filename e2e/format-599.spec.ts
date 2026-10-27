import { test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as prettier from 'prettier';

test('format the seven changed 599 source files, then run scoped lint and unit checks', async () => {
  const paths = [
    'apps/server/src/api/heute.ts',
    'apps/web/src/heute/api.ts',
    'apps/web/src/heute/attention-bar.test.tsx',
    'apps/web/src/heute/attention-bar.tsx',
    'apps/web/src/heute/attention-model.ts',
    'packages/db/src/repos/contacts.test.ts',
    'packages/db/src/repos/contacts.ts',
  ];
  for (const path of paths) {
    const source = readFileSync(path, 'utf8');
    const options = await prettier.resolveConfig(path);
    writeFileSync(path, await prettier.format(source, { ...options, filepath: path }));
  }
  const patch = execFileSync('git', ['diff', '--', ...paths], { encoding: 'utf8' });
  const hash = createHash('sha256').update(patch).digest('hex');
  writeFileSync('e2e/format-599-output.txt', patch);
  console.log(`FORMAT599_SHA256=${hash}`);
  execFileSync(process.execPath, [
    'node_modules/eslint/bin/eslint.js',
    ...paths,
  ], { stdio: 'inherit' });
  execFileSync(process.execPath, [
    'node_modules/vitest/vitest.mjs',
    'run',
    '--config=vitest.config.ts',
    'packages/db/src/repos/contacts.test.ts',
    'apps/web/src/heute/attention-bar.test.tsx',
  ], { stdio: 'inherit' });
});
