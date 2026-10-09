import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { defaultMigrationsFolder, migrateDatabase, openDatabase } from './client';

it('adds nullable bank observations without losing existing account mapping or staged transactions', () => {
  const source = defaultMigrationsFolder();
  const folder = mkdtempSync(join(tmpdir(), 'budget-bank-migration-'));
  const opened = openDatabase(':memory:');
  try {
    const journal = JSON.parse(readFileSync(join(source, 'meta', '_journal.json'), 'utf8')) as {
      entries: { tag: string }[];
    };
    const index = journal.entries.findIndex((e) => e.tag.endsWith('_bank_followups'));
    expect(index).toBeGreaterThan(0);
    const entries = journal.entries.slice(0, index);
    mkdirSync(join(folder, 'meta'));
    writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
    for (const entry of entries)
      copyFileSync(join(source, entry.tag + '.sql'), join(folder, entry.tag + '.sql'));
    migrateDatabase(opened.db, folder);
    // Raw rows: later migrations add account columns that the old schema does not have yet.
    opened.sqlite.exec(`
      INSERT INTO account (id, name, type, role, on_budget, opening_date, opening_balance_cents, sort_order) VALUES ('giro', 'Giro', 'checking', 'budget', 1, '2023-10-01', 100000, 1);
      INSERT INTO bank_sync_consent (id, initiator, state_hash, expires_at, label, next_run_at) VALUES ('consent-a', 'synthetic', 'synthetic-hash', '2027-01-01T00:00:00Z', 'Bank A', '2027-01-01T00:00:00Z');
      INSERT INTO bank_sync_account (id, consent_id, secret, label, currency, account_id, from_date, last_sync_at) VALUES ('link-a', 'consent-a', 'synthetic-ciphertext', 'Konto A', 'EUR', 'giro', '2026-09-01', '2026-10-02T10:00:00Z');
      INSERT INTO bank_sync_candidate (id, account_id, dedupe_key, date, amount_cents, currency, memo) VALUES ('candidate-a', 'giro', 'entry-a', '2026-10-02', -129, 'EUR', 'Banktext');
    `);
    migrateDatabase(opened.db);
    migrateDatabase(opened.db);
    expect(
      opened.sqlite
        .prepare(
          'SELECT account_id, secret, last_sync_at, balance_cents, balance_date, balance_fetched_at, last_result FROM bank_sync_account',
        )
        .get(),
    ).toEqual({
      account_id: 'giro',
      secret: 'synthetic-ciphertext',
      last_sync_at: '2026-10-02T10:00:00Z',
      balance_cents: null,
      balance_date: null,
      balance_fetched_at: null,
      last_result: null,
    });
    expect(opened.sqlite.prepare('SELECT amount_cents FROM bank_sync_candidate').get()).toEqual({
      amount_cents: -129,
    });
    expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(opened.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  } finally {
    opened.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
