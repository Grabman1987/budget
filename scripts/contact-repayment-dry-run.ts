import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import * as schema from '../packages/db/src/schema/index';
import { previewContactRepayments } from '../packages/db/src/repos/contact-repayment-preview';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--database' || !args[1]) {
  throw new Error(
    'Usage: npx tsx scripts/contact-repayment-dry-run.ts --database <operator-copy.sqlite>',
  );
}
const path = resolve(args[1]);
if (path.split(/[\\/]/).some((part) => part.toLowerCase() === 'private'))
  throw new Error('Private folders are not supported by this command.');
const resolved = realpathSync(path);
if (resolved.split(/[\\/]/).some((part) => part.toLowerCase() === 'private'))
  throw new Error('Private folders are not supported by this command.');
const sqlite = new Database(resolved, { readonly: true, fileMustExist: true });
try {
  sqlite.pragma('query_only = ON');
  const report = previewContactRepayments(drizzle(sqlite, { schema }));
  process.stdout.write(`${JSON.stringify({ mode: 'report-only', rows: report }, null, 2)}\n`);
} finally {
  sqlite.close();
}
