import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { expect, it } from 'vitest';
import {
  defaultMigrationsFolder,
  migrateDatabase,
  openDatabase,
  type OpenedDatabase,
} from './client';

const TAG = '0056_ledger_version';

/** Scope this test to the genuine 0055 predecessor and 0056 target schemas. */
function migrationFolder(root: string, inclusive: boolean): string {
  const source = defaultMigrationsFolder();
  const folder = join(root, inclusive ? 'through-0056' : 'through-0055');
  mkdirSync(join(folder, 'meta'), { recursive: true });
  const journal = JSON.parse(readFileSync(join(source, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string }[];
  };
  journal.entries = journal.entries.filter((e) => (inclusive ? e.tag <= TAG : e.tag < TAG));
  expect(journal.entries.at(-1)?.tag).toBe(inclusive ? TAG : '0055_quote_fx_attempts');
  writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify(journal));
  for (const e of journal.entries)
    copyFileSync(join(source, `${e.tag}.sql`), join(folder, `${e.tag}.sql`));
  return folder;
}

const rows = (o: OpenedDatabase, sql: string) => o.sqlite.prepare(sql).all();
const count = (o: OpenedDatabase, table: string) =>
  (o.sqlite.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n;
const triggerCount = (o: OpenedDatabase) =>
  (
    o.sqlite
      .prepare(
        "SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'ledger_version_%'",
      )
      .get() as { n: number }
  ).n;

it('migration 0056 on a populated 0055 database: additive only, rows unchanged, guarded rollback', () => {
  const root = mkdtempSync(join(tmpdir(), 'synthetic-ledger-version-'));
  let opened: OpenedDatabase | undefined;
  try {
    const db = (opened = openDatabase(join(root, 'predecessor.sqlite')));
    // The plain drizzle migrator: `migrateDatabase` would already add the trigger set.
    db.sqlite.pragma('foreign_keys = OFF');
    migrate(drizzle(db.sqlite), { migrationsFolder: migrationFolder(root, false) });
    expect(rows(db, "SELECT name FROM sqlite_master WHERE name = 'ledger_version'")).toEqual([]);
    db.sqlite.exec(`
      INSERT INTO security (id, name, kind, currency) VALUES ('s1', 'Synthetic Fonds', 'etf', 'EUR');
      INSERT INTO price (security_id, date, price_micro, currency, source)
        VALUES ('s1', '2030-01-02', 12340000, 'EUR', 'ariva'), ('s1', '2030-01-03', 12500000, 'EUR', 'manual');
      INSERT INTO app_setting (id, value) VALUES ('k', 'v');
    `);
    const tables = ['security', 'price', 'app_setting'];
    const before = tables.map((t) => rows(db, `SELECT * FROM "${t}" ORDER BY 1`));
    const names = rows(
      db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const migrations = count(db, '__drizzle_migrations');

    migrateDatabase(db.db, migrationFolder(root, true));
    migrateDatabase(db.db, migrationFolder(root, true)); // idempotent
    expect(count(db, '__drizzle_migrations')).toBe(migrations + 1);
    expect(tables.map((t) => rows(db, `SELECT * FROM "${t}" ORDER BY 1`))).toEqual(before);
    expect(
      rows(
        db,
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'ledger_version' ORDER BY name",
      ),
    ).toEqual(names);
    expect(rows(db, 'SELECT id, version FROM ledger_version')).toEqual([{ id: 1, version: 0 }]);
    // 81 ledger tables, three triggers each.
    expect(triggerCount(db)).toBe(243);
    expect(db.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(db.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    // The counter is a single row.
    expect(() => db.sqlite.exec('INSERT INTO ledger_version (id, version) VALUES (2, 0)')).toThrow(
      /CHECK/,
    );

    const rollback = readFileSync(
      join(defaultMigrationsFolder(), 'rollback', `${TAG}.sql`),
      'utf8',
    );
    db.sqlite.transaction(() => db.sqlite.exec(rollback))();
    expect(count(db, '__drizzle_migrations')).toBe(migrations);
    expect(triggerCount(db)).toBe(0);
    expect(rows(db, "SELECT name FROM sqlite_master WHERE name = 'ledger_version'")).toEqual([]);
    expect(tables.map((t) => rows(db, `SELECT * FROM "${t}" ORDER BY 1`))).toEqual(before);
    migrateDatabase(db.db, migrationFolder(root, true));
    expect(count(db, '__drizzle_migrations')).toBe(migrations + 1);
    expect(triggerCount(db)).toBe(243);
  } finally {
    opened?.close();
    rmSync(root, { recursive: true, force: true });
  }
});
