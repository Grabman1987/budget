// Loads the synthetic sample ledger into ./data/dev.sqlite (npm run db:seed).
// Usage: npm run db:seed [-- --file path/to.sqlite] [--fresh] [--contacts]
// `--contacts` adds the opt-in contacts scenario (Auslagen, a repayment, a passed-through
// subscription) and materialises the expected occurrences for BUDGET_TODAY (default: today).
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { devDatabasePath, migrateDatabase, openDatabase, refreshOccurrences } from '@budget/db';
import { todayInVienna } from '@budget/domain';
import { sampleLedger, withContactsScenario } from '@budget/fixtures';
import { seedDatabase } from '@budget/fixtures/seed';

const args = process.argv.slice(2);
const fileIndex = args.indexOf('--file');
const file = fileIndex >= 0 ? resolve(args[fileIndex + 1] ?? '') : devDatabasePath();
const fresh = args.includes('--fresh');
const contacts = args.includes('--contacts');

mkdirSync(dirname(file), { recursive: true });
if (fresh) for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true });
if (existsSync(file)) {
  console.error(`${file} exists. Use --fresh to recreate it.`);
  process.exit(1);
}

const { db, close } = openDatabase(file);
try {
  migrateDatabase(db);
  const { rows } = seedDatabase(
    db,
    contacts ? withContactsScenario(sampleLedger()) : sampleLedger(),
  );
  if (contacts) refreshOccurrences(db, process.env['BUDGET_TODAY'] ?? todayInVienna());
  const total = Object.values(rows).reduce((a, b) => a + b, 0);
  console.log(
    `Seeded ${file}: ${total} rows (${rows['bookings']} bookings, ${rows['prices']} prices).`,
  );
} finally {
  close();
}
