import { capturePlanSnapshot, migrateDatabase, openDatabase } from '@budget/db';
import { monthsBetween, todayInVienna } from '@budget/domain';
import { resolve } from 'node:path';

// Operator-only, no provider calls. Status output contains month identifiers, never amounts.
const [from, to = from] = process.argv.slice(2);
if (!from || !to || ![from, to].every((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)) || from > to)
  throw new Error('Usage: npx tsx scripts/plan-snapshot.ts YYYY-MM [YYYY-MM]');
const opened = openDatabase(
  resolve(
    process.env['DATABASE_PATH'] ?? resolve(process.env['DATA_DIR'] ?? 'data', 'budget.sqlite'),
  ),
);
try {
  migrateDatabase(opened.db);
  for (const month of monthsBetween(from, to))
    console.log(`${month}: ${capturePlanSnapshot(opened.db, month, todayInVienna()).status}`);
} finally {
  opened.close();
}
