import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { expect, it } from 'vitest';
import { defaultMigrationsFolder, openDatabase } from './client';
import { listAssignmentRules } from './repos/assignment-rules';
import { seedBasics } from './repos/test-helpers';
import { booking, bankSyncCandidate } from './schema';

it('preserves existing bank rows and category rules while adding cleanup and action storage', () => {
  const { db, sqlite, close } = openDatabase(':memory:');
  try {
    const folder = defaultMigrationsFolder();
    const journal = JSON.parse(readFileSync(join(folder, 'meta', '_journal.json'), 'utf8')) as {
      entries: { tag: string }[];
    };
    const index = journal.entries.findIndex((entry) => entry.tag.endsWith('_assignment_rules'));
    expect(index).toBeGreaterThan(0);
    const migrations = readMigrationFiles({ migrationsFolder: folder });
    const migration = migrations[index]!;
    for (const older of migrations.slice(0, index))
      for (const statement of older.sql) sqlite.exec(statement);
    seedBasics(db);
    sqlite.exec(`
      INSERT INTO booking (id, account_id, date, amount_cents, source, memo)
        VALUES ('legacy-bank', 'giro', '2026-10-02', -1201, 'bank', 'Shop A');
      INSERT INTO booking_split (id, booking_id, amount_cents, category_id)
        VALUES ('legacy-split', 'legacy-bank', -1201, 'essen');
      INSERT INTO bank_sync_candidate (id, account_id, dedupe_key, date, amount_cents, currency, memo)
        VALUES ('legacy-candidate', 'giro', 'synthetic-key', '2026-10-02', -2301, 'EUR', 'Shop B');
      INSERT INTO assignment_rule (id, name, match_json, category_id)
        VALUES ('legacy-rule', 'Shop zuordnen', '{"mode":"all","conditions":[{"type":"contains","text":"Shop"}]}', 'essen');
    `);
    const splits = sqlite.prepare('SELECT * FROM booking_split').all();
    const audit = sqlite.prepare('SELECT * FROM audit_log').all();
    for (const statement of migration.sql) sqlite.exec(statement);
    expect(db.select().from(booking).all()).toMatchObject([
      {
        id: 'legacy-bank',
        amountCents: -1201,
        bankRawText: null,
        bankRawPayee: null,
        bankSourceId: null,
      },
    ]);
    expect(db.select().from(bankSyncCandidate).all()).toMatchObject([
      { id: 'legacy-candidate', amountCents: -2301, rawPayee: null, sourceId: null },
    ]);
    expect(listAssignmentRules(db)).toMatchObject([
      { id: 'legacy-rule', automatic: false, actions: { categoryId: 'essen' } },
    ]);
    expect(sqlite.prepare('SELECT * FROM booking_split').all()).toEqual(splits);
    expect(sqlite.prepare('SELECT * FROM audit_log').all()).toEqual(audit);
    expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  } finally {
    close();
  }
});
