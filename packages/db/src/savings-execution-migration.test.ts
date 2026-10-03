import { readMigrationFiles } from 'drizzle-orm/migrator';
import { expect, it } from 'vitest';
import { defaultMigrationsFolder, openDatabase } from './client';

it('upgrades existing trades without changing cash, import identities or audit history', () => {
  const { sqlite, close } = openDatabase(':memory:');
  try {
    const migrations = readMigrationFiles({ migrationsFolder: defaultMigrationsFolder() });
    for (const migration of migrations.slice(0, 28))
      for (const statement of migration.sql) sqlite.exec(statement);
    sqlite.exec(`
      INSERT INTO account (id, name, type, role, on_budget, opening_date)
        VALUES ('depot', 'Synthetisches Depot', 'brokerage', 'investment', 0, '2026-01-01');
      INSERT INTO security (id, name, kind) VALUES ('fund', 'Synthetischer Fonds', 'fund');
      INSERT INTO booking (id, account_id, date, amount_cents)
        VALUES ('cash', 'depot', '2026-09-15', -10100);
      INSERT INTO booking_split (id, booking_id, amount_cents)
        VALUES ('cash-split', 'cash', -10100);
      INSERT INTO trade (id, security_id, account_id, date, kind, units_e8, amount_cents,
                         fee_cents, booking_id, import_key)
        VALUES ('buy', 'fund', 'depot', '2026-09-15', 'buy', 200000000, 10000,
                100, 'cash', 'synthetic-import'),
               ('delivery', 'fund', 'depot', '2026-09-16', 'delivery_in', 100000000, 5000,
                0, NULL, NULL);
      INSERT INTO audit_log (id, action, entity_type, entity_id, after_json)
        VALUES ('audit', 'create', 'trade', 'buy', '{"id":"buy"}');
    `);
    const before = (table: string) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
    const retainedTrades = before('trade');
    const cash = before('booking');
    const splits = before('booking_split');
    const audit = before('audit_log');
    for (const migration of migrations.slice(28))
      for (const statement of migration.sql) sqlite.exec(statement);
    expect(before('trade')).toEqual(
      retainedTrades.map((row) => ({
        ...(row as object),
        savings_plan_id: null,
        savings_month: null,
      })),
    );
    expect(before('booking')).toEqual(cash);
    expect(before('booking_split')).toEqual(splits);
    expect(before('audit_log')).toEqual(audit);
    expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    sqlite.exec(`INSERT INTO savings_plan (id, security_id, account_id, amount_cents, day_of_month, valid_from)
      VALUES ('plan', 'fund', 'depot', 10000, 15, '2026-09-01')`);
    const link = sqlite.prepare(
      'UPDATE trade SET savings_plan_id = ?, savings_month = ? WHERE id = ?',
    );
    expect(() => link.run('plan', '2026-00', 'buy')).toThrow(/CHECK/);
    expect(() => link.run('plan', '2026-13', 'buy')).toThrow(/CHECK/);
    expect(() => link.run('plan', null, 'buy')).toThrow(/CHECK/);
    expect(() => link.run('plan', '2026-09', 'delivery')).toThrow(/CHECK/);
    expect(() => link.run('missing', '2026-09', 'buy')).toThrow(/FOREIGN KEY/);
    link.run('plan', '2026-09', 'buy');
    expect(() =>
      sqlite.exec(`INSERT INTO trade
      (id, security_id, account_id, date, kind, units_e8, amount_cents, savings_plan_id, savings_month)
      VALUES ('duplicate', 'fund', 'depot', '2026-09-15', 'buy', 100000000, 10000, 'plan', '2026-09')`),
    ).toThrow(/UNIQUE/);
  } finally {
    close();
  }
});
