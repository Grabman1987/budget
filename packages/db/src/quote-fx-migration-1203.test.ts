import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  defaultMigrationsFolder,
  migrateDatabase,
  openDatabase,
  type OpenedDatabase,
} from './client';

const TAG = '0055_quote_fx_attempts';

/** Scope this test to the genuine 0054 predecessor and 0055 target schemas. */
function migrationFolder(root: string, inclusive: boolean): string {
  const source = defaultMigrationsFolder();
  const folder = join(root, inclusive ? 'through-0055' : 'through-0054');
  mkdirSync(join(folder, 'meta'), { recursive: true });
  const journal = JSON.parse(readFileSync(join(source, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string }[];
  };
  journal.entries = journal.entries.filter((e) => (inclusive ? e.tag <= TAG : e.tag < TAG));
  expect(journal.entries.at(-1)?.tag).toBe(inclusive ? TAG : '0054_account_purpose');
  writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify(journal));
  for (const e of journal.entries)
    copyFileSync(join(source, `${e.tag}.sql`), join(folder, `${e.tag}.sql`));
  return folder;
}

const tableNames = (o: OpenedDatabase) =>
  (
    o.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((r) => r.name);
const rows = (o: OpenedDatabase, sql: string) => o.sqlite.prepare(sql).all();
const count = (o: OpenedDatabase, table: string) =>
  (o.sqlite.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n;

it('#1203 migration 0055 on a populated 0054 database: additive only, rows unchanged, guarded rollback', () => {
  const root = mkdtempSync(join(tmpdir(), 'synthetic-quote-fx-1203-'));
  let opened: OpenedDatabase | undefined;
  try {
    const db = (opened = openDatabase(join(root, 'predecessor.sqlite')));
    migrateDatabase(db.db, migrationFolder(root, false));
    expect(tableNames(db)).not.toContain('market_attempt');
    db.sqlite.exec(`
      INSERT INTO security (id, name, kind, currency) VALUES ('s1', 'Synthetic Fonds', 'etf', 'EUR');
      INSERT INTO price (security_id, date, price_micro, currency, source)
        VALUES ('s1', '2030-01-02', 12340000, 'EUR', 'ariva'), ('s1', '2030-01-03', 12500000, 'EUR', 'manual');
    `);
    const priceBefore = rows(db, 'SELECT * FROM price ORDER BY date');
    const securitySql =
      'SELECT id, name, kind, currency, prices_enabled, quote_adjusted FROM security';
    const securityBefore = rows(db, securitySql);
    const predecessorTables = tableNames(db);
    const migrations = count(db, '__drizzle_migrations');

    migrateDatabase(db.db, migrationFolder(root, true));
    migrateDatabase(db.db, migrationFolder(root, true)); // idempotent
    expect(count(db, '__drizzle_migrations')).toBe(migrations + 1);
    expect(tableNames(db)).toEqual([...predecessorTables, 'market_attempt'].sort());
    // Existing rows keep every value; new columns are null / off.
    expect(rows(db, 'SELECT * FROM price ORDER BY date')).toEqual(
      priceBefore.map((p) => ({
        ...(p as object),
        source_currency: null,
        source_price_micro: null,
        fx_rate_micro: null,
      })),
    );
    expect(rows(db, securitySql)).toEqual(securityBefore);
    expect(rows(db, 'SELECT quote_fx_currency FROM security')).toEqual([
      { quote_fx_currency: null },
    ]);
    expect(count(db, 'market_attempt')).toBe(0);
    expect(db.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(db.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    expect(() =>
      db.sqlite.exec(
        "INSERT INTO market_attempt (id, security_id, source, attempted_at, outcome) VALUES ('x', 's1', 'ariva', '2030-01-04T00:00:00Z', 'bogus')",
      ),
    ).toThrow(/CHECK/);
    expect(() =>
      db.sqlite.exec(
        "INSERT INTO market_attempt (id, security_id, source, attempted_at, outcome) VALUES ('x', 'missing', 'ariva', '2030-01-04T00:00:00Z', 'ok')",
      ),
    ).toThrow(/FOREIGN KEY/);

    const rollback = readFileSync(
      join(defaultMigrationsFolder(), 'rollback', `${TAG}.sql`),
      'utf8',
    );
    const run = () => db.sqlite.transaction(() => db.sqlite.exec(rollback))();
    // Retained data refuses the downgrade atomically (bytes unchanged).
    db.sqlite.exec(
      "INSERT INTO market_attempt (id, security_id, source, attempted_at, outcome, http_status) VALUES ('a1', 's1', 'ariva', '2030-01-04T00:00:00Z', 'http', 503)",
    );
    let bytes = db.sqlite.serialize();
    expect(() => run()).toThrow();
    expect(db.sqlite.serialize().equals(bytes)).toBe(true);
    db.sqlite.exec(`
      DELETE FROM market_attempt;
      UPDATE price SET source_currency = 'USD', source_price_micro = 1, fx_rate_micro = 1 WHERE date = '2030-01-02';
    `);
    bytes = db.sqlite.serialize();
    expect(() => run()).toThrow();
    expect(db.sqlite.serialize().equals(bytes)).toBe(true);
    db.sqlite.exec(
      "UPDATE price SET source_currency = NULL, source_price_micro = NULL, fx_rate_micro = NULL; UPDATE security SET quote_fx_currency = 'USD'",
    );
    bytes = db.sqlite.serialize();
    expect(() => run()).toThrow();
    expect(db.sqlite.serialize().equals(bytes)).toBe(true);
    // Unused additions roll back to the exact predecessor; forward again works.
    db.sqlite.exec('UPDATE security SET quote_fx_currency = NULL');
    run();
    expect(count(db, '__drizzle_migrations')).toBe(migrations);
    expect(tableNames(db)).toEqual(predecessorTables);
    expect(rows(db, 'SELECT * FROM price ORDER BY date')).toEqual(priceBefore);
    migrateDatabase(db.db, migrationFolder(root, true));
    expect(count(db, '__drizzle_migrations')).toBe(migrations + 1);
  } finally {
    opened?.close();
    rmSync(root, { recursive: true, force: true });
  }
});
