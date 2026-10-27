import { test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as prettier from 'prettier';

test('format only the five CI-reported files', async () => {
  const paths = [
    'e2e/issue-562-bank-suggestions.spec.ts',
    'e2e/issue-741-payroll-automation.spec.ts',
    'e2e/year-report.spec.ts',
    'packages/db/src/repos/inbox-bank-account-724.test.ts',
    'packages/db/src/repos/inbox.ts',
  ];
  for (const path of paths) {
    const text = readFileSync(path, 'utf8');
    const options = await prettier.resolveConfig(path);
    writeFileSync(path, await prettier.format(text, { ...options, filepath: path }));
  }
  const patch = execFileSync('git', ['diff', '--', ...paths], { encoding: 'utf8' });
  console.log('FORMAT785_SHA256=' + createHash('sha256').update(patch).digest('hex'));
  console.log('FORMAT785_BASE64=' + Buffer.from(patch).toString('base64'));
});