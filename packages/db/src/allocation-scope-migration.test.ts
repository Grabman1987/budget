import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { defaultMigrationsFolder, migrateDatabase, openDatabase } from './client';
import { holdingValuesAsOf, netWorthAsOf } from './repos/portfolio';

it('0033 continues the main 0032 snapshot and preserves assignment-rule schema', () => {
  const folder = defaultMigrationsFolder();
  const snapshot = (index: string) =>
    JSON.parse(readFileSync(join(folder, `meta/${index}_snapshot.json`), 'utf8')) as {
      id: string;
      prevId: string;
      tables: Record<string, unknown>;
    };
  const main = snapshot('0032');
  const allocation = snapshot('0033');
  expect(allocation.prevId).toBe(main.id);
  expect(allocation.id).not.toBe(main.id);
  for (const table of Object.keys(main.tables))
    if (table !== 'account' && table !== 'security')
      expect(allocation.tables[table]).toEqual(main.tables[table]);
});

it('0033 migrates latest main, preserves every original source column and valuation, repeats safely and restores a snapshot', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-scope-migration-'));
  const oldFolder = join(dir, 'main');
  mkdirSync(join(oldFolder, 'meta'), { recursive: true });
  const folder = defaultMigrationsFolder();
  const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  expect(journal.entries.find((e) => e.idx === 33)?.tag).toBe('0033_allocation_scope');
  const oldJournal = { ...journal, entries: journal.entries.filter((e) => e.idx < 33) };
  expect(oldJournal.entries.at(-1)?.tag).toBe('0032_assignment_rules');
  writeFileSync(join(oldFolder, 'meta/_journal.json'), JSON.stringify(oldJournal));
  for (const entry of oldJournal.entries)
    copyFileSync(join(folder, `${entry.tag}.sql`), join(oldFolder, `${entry.tag}.sql`));
  const opened = openDatabase(join(dir, 'synthetic.sqlite'));
  let restored: ReturnType<typeof openDatabase> | undefined;
  try {
    migrateDatabase(opened.db, oldFolder);
    opened.sqlite
      .exec(`INSERT INTO account (id, name, type, role, on_budget, opening_date, opening_balance_cents) VALUES
      ('broker', 'A', 'brokerage', 'investment', 0, '2025-01-01', -100),
      ('settlement', 'B', 'checking', 'reserve', 0, '2025-01-01', 250),
      ('current', 'Depot in a name', 'checking', 'budget', 1, '2025-01-01', 500),
      ('coin', 'C', 'crypto', 'investment', 0, '2025-01-01', 0),
      ('platform', 'D', 'p2p', 'investment', 0, '2025-01-01', 300),
      ('card', 'E', 'credit_card', 'budget', 1, '2025-01-01', -50),
      ('debt', 'F', 'loan', 'debt', 0, '2025-01-01', -1000);
      UPDATE account SET reference_account_id = 'settlement' WHERE id = 'broker';
      INSERT INTO asset_class (id, name) VALUES ('a', 'Synthetic');
      INSERT INTO asset_class_target (id, asset_class_id, valid_from, target_share_bp) VALUES ('t', 'a', '2025-01-01', 10000);
      INSERT INTO security (id, name, kind, asset_class_id) VALUES ('s', 'Synthetic', 'fund', 'a');
      INSERT INTO holding (id, account_id, security_id, as_of, units_e8, cost_basis_cents) VALUES ('h', 'broker', 's', '2025-01-01', 100000000, 100);
      INSERT INTO price (security_id, date, price_micro, currency, source) VALUES ('s', '2025-01-01', 1010000, 'EUR', 'manual');
      INSERT INTO security_exposure_version (id, security_id, valid_from, complete, source) VALUES ('v', 's', '2025-01-01', 1, 'synthetic');
      INSERT INTO security_asset_exposure (id, version_id, security_id, asset_class_id, valid_from, weight_bp, source) VALUES ('e', 'v', 's', 'a', '2025-01-01', 10000, 'synthetic');`);
    opened.sqlite.exec(`
      INSERT INTO payee (id, name) VALUES ('payee', 'Synthetic merchant');
      INSERT INTO booking (id, account_id, date, amount_cents, source, bank_raw_text, bank_raw_payee, bank_source_id)
        VALUES ('booking', 'current', '2025-01-01', -25, 'bank', 'Synthetic raw text', 'Synthetic raw payee', 'synthetic-source');
      INSERT INTO bank_sync_candidate (id, account_id, dedupe_key, date, amount_cents, currency, memo, raw_payee)
        VALUES ('candidate', 'current', 'synthetic-key', '2025-01-01', -30, 'EUR', 'Synthetic memo', 'Synthetic raw payee');
      INSERT INTO assignment_rule (id, name, match_json, action_json, automatic)
        VALUES ('rule', 'Synthetic rule', '{}', '{"payeeId":"payee"}', 1);
      INSERT INTO bank_payee_cleanup (id, config_json) VALUES ('cleanup', '{}');
      INSERT INTO bank_payee_alias (id, source_id, raw_key, payee_id)
        VALUES ('alias', 'synthetic-source', 'synthetic raw payee', 'payee');
    `);
    const tables = [
      'account',
      'security',
      'holding',
      'trade',
      'price',
      'asset_class',
      'asset_class_target',
      'security_exposure_version',
      'security_asset_exposure',
      'audit_log',
      'booking',
      'bank_sync_candidate',
      'assignment_rule',
      'bank_payee_cleanup',
      'bank_payee_alias',
    ];
    const columns = new Map(
      tables.map((name) => [
        name,
        (opened.sqlite.pragma(`table_info(${name})`) as { name: string }[])
          .map((c) => c.name)
          .join(','),
      ]),
    );
    const rows = () =>
      tables.map((name) =>
        opened.sqlite.prepare(`SELECT ${columns.get(name)} FROM ${name} ORDER BY rowid`).all(),
      );
    const before = rows();
    const worth = netWorthAsOf(opened.db, '2025-01-01');
    const values = holdingValuesAsOf(opened.db, '2025-01-01');
    await opened.sqlite.backup(join(dir, 'before.sqlite'));
    migrateDatabase(opened.db);
    expect(rows()).toEqual(before);
    expect(netWorthAsOf(opened.db, '2025-01-01')).toEqual(worth);
    expect(holdingValuesAsOf(opened.db, '2025-01-01')).toEqual(values);
    expect(
      opened.sqlite.prepare('SELECT id, allocation_scope FROM account ORDER BY id').all(),
    ).toEqual([
      { id: 'broker', allocation_scope: 'included' },
      { id: 'card', allocation_scope: 'excluded' },
      { id: 'coin', allocation_scope: 'included' },
      { id: 'current', allocation_scope: 'excluded' },
      { id: 'debt', allocation_scope: 'excluded' },
      { id: 'platform', allocation_scope: 'included' },
      { id: 'settlement', allocation_scope: 'included' },
    ]);
    expect(opened.sqlite.prepare('SELECT allocation_included FROM security').get()).toEqual({
      allocation_included: 1,
    });
    const after = opened.sqlite.prepare('SELECT * FROM account ORDER BY id').all();
    migrateDatabase(opened.db);
    expect(opened.sqlite.prepare('SELECT * FROM account ORDER BY id').all()).toEqual(after);
    expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(opened.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    restored = openDatabase(join(dir, 'before.sqlite'));
    migrateDatabase(restored.db);
    expect(
      tables.map((name) =>
        restored!.sqlite.prepare(`SELECT ${columns.get(name)} FROM ${name} ORDER BY rowid`).all(),
      ),
    ).toEqual(before);
    expect(netWorthAsOf(restored.db, '2025-01-01')).toEqual(worth);
    expect(restored.sqlite.pragma('foreign_key_check')).toEqual([]);
  } finally {
    restored?.close();
    opened.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);
