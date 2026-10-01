// Writes the synthetic Portfolio Performance file (npm run fixtures:pp). Usage: [-- --out dir] [--extras]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PP_FILE_NAME, ppExport } from '@budget/fixtures/pp';

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = resolve(option('--out') ?? 'packages/fixtures/pp-export');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, PP_FILE_NAME), ppExport(undefined, { extras: args.includes('--extras') }));
console.log(`Wrote the synthetic Portfolio Performance file to ${out}.`);
