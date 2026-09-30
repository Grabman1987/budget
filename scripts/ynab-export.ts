// Writes the synthetic YNAB export (npm run fixtures:ynab). Usage: [-- --out dir] [--seed n]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { YNAB_FILE_NAMES, ynabExport } from '@budget/fixtures/ynab';

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = resolve(option('--out') ?? 'packages/fixtures/ynab-export');
const files = ynabExport(Number(option('--seed') ?? 1));
mkdirSync(out, { recursive: true });
writeFileSync(join(out, YNAB_FILE_NAMES.register), files.register);
writeFileSync(join(out, YNAB_FILE_NAMES.plan), files.plan);
console.log(`Wrote the synthetic YNAB export to ${out}.`);
