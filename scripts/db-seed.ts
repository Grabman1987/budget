// Loads the synthetic sample ledger into ./data/dev.sqlite (npm run db:seed).
// Usage: npm run db:seed [-- --file path/to.sqlite] [--fresh]
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { migrateDatabase, openDatabase } from '@budget/db';
import { seedDatabase } from '@budget/fixtures/seed';

const args = process.argv.slice(2);
const fileIndex = args.indexOf('--file');
const file = resolve(fileIndex >= 0 ? (args[fileIndex + 1] ?? '') : 'data/dev.sqlite');
const fresh = args.includes('--fresh');

mkdirSync(dirname(file), { recursive: true });
if (fresh) for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true });
if (existsSync(file)) {
  console.error(`${file} exists. Use --fresh to recreate it.`);
  process.exit(1);
}

const { db, close } = openDatabase(file);
try {
  migrateDatabase(db);
  const { rows } = seedDatabase(db);
  const total = Object.values(rows).reduce((a, b) => a + b, 0);
  console.log(
    `Seeded ${file}: ${total} rows (${rows['bookings']} bookings, ${rows['prices']} prices).`,
  );
} finally {
  close();
}
