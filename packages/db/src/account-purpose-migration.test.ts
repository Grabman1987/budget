import { readMigrationFiles } from 'drizzle-orm/migrator';
import { expect, it } from 'vitest';
import { defaultMigrationsFolder, openDatabase } from './client';

it('adds nullable purpose without rewriting existing accounts or audit history', () => {
  const { sqlite, close } = openDatabase(':memory:');
  try {
    const migrations = readMigrationFiles({ migrationsFolder: defaultMigrationsFolder() });
    for (const migration of migrations.slice(0, 54))
      for (const statement of migration.sql) sqlite.exec(statement);
    sqlite.exec(`INSERT INTO account (id, name, type, role, on_budget, opening_date, opening_balance_cents, overdraft_limit_cents)
      VALUES ('synthetic', 'Synthetic account', 'cash', 'budget', 1, '2026-09-01', 12345, 50000)`);
    const before = sqlite.prepare('SELECT * FROM account').all();
    const audit = sqlite.prepare('SELECT * FROM audit_log').all();
    for (const statement of migrations[54]!.sql) sqlite.exec(statement);
    expect(sqlite.prepare('SELECT * FROM account').all()).toEqual(
      before.map((row) => ({ ...(row as object), purpose: null })),
    );
    expect(sqlite.prepare('SELECT * FROM audit_log').all()).toEqual(audit);
    expect(() => sqlite.exec("UPDATE account SET purpose = 'invalid'")).toThrow();
    expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  } finally {
    close();
  }
});
