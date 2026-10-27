import { test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as prettier from 'prettier';

test('format only the 558 changed source files', async () => {
  const paths = [
    'apps/web/src/api/http.ts',
    'apps/web/src/api/offline-write-558.test.ts',
    'apps/web/src/pwa/local-data.test.ts',
    'apps/web/src/pwa/local-data.ts',
    'apps/web/src/pwa/offline-state.tsx',
    'apps/web/src/pwa/pwa.css',
    'apps/web/src/pwa/pwa.test.tsx',
    'apps/web/src/pwa/pwa.tsx',
    'apps/web/src/pwa/snapshots-558.test.ts',
    'apps/web/src/pwa/snapshots.ts',
    'e2e/issue-558-offline-last-state.spec.ts',
  ];
  for (const path of paths) {
    const text = readFileSync(path, 'utf8');
    const options = await prettier.resolveConfig(path);
    writeFileSync(path, await prettier.format(text, { ...options, filepath: path }));
  }
  const patch = execFileSync('git', ['diff', '--', ...paths], { encoding: 'utf8' });
  console.log('FORMAT558_SHA256=' + createHash('sha256').update(patch).digest('hex'));
  console.log('FORMAT558_BASE64=' + Buffer.from(patch).toString('base64'));
});
