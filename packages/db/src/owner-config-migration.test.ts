import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { defaultMigrationsFolder, migrateDatabase, openDatabase } from './client';
import { accounts } from './repos/entities';
import { listTargetTiers, setTargetTiers } from './repos/asset-target-tiers';
import { testCtx } from './repos/test-helpers';

it('adds loan terms and target tiers without touching existing accounts or asset classes', () => {
  const source = defaultMigrationsFolder();
  const folder = mkdtempSync(join(tmpdir(), 'budget-owner-config-migration-'));
  const opened = openDatabase(':memory:');
  try {
    const journal = JSON.parse(readFileSync(join(source, 'meta', '_journal.json'), 'utf8')) as {
      entries: { tag: string }[];
    };
    const index = journal.entries.findIndex((e) => e.tag.endsWith('_owner_config'));
    expect(index).toBeGreaterThan(0);
    const entries = journal.entries.slice(0, index);
    mkdirSync(join(folder, 'meta'));
    writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
    for (const entry of entries)
      copyFileSync(join(source, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
    migrateDatabase(opened.db, folder);
    opened.sqlite.exec(`
      INSERT INTO account (id, name, type, role, on_budget, opening_date, opening_balance_cents, interest_rate_bp, term_end, sort_order)
        VALUES ('loan', 'Kredit', 'loan', 'debt', 0, '2023-10-01', -500000, 450, '2030-01-01', 1);
      INSERT INTO account (id, name, type, role, on_budget, opening_date, sort_order)
        VALUES ('giro', 'Giro', 'checking', 'budget', 1, '2023-10-01', 2);
      INSERT INTO asset_class (id, name, sort_order) VALUES ('ac', 'Aktien', 1);
    `);
    migrateDatabase(opened.db);
    migrateDatabase(opened.db); // Restarting must not repeat the additive DDL.
    expect(
      opened.sqlite
        .prepare(
          'SELECT id, interest_rate_bp, term_end, interest_kind, installment_cents, term_start, original_amount_cents FROM account ORDER BY id',
        )
        .all(),
    ).toEqual([
      {
        id: 'giro',
        interest_rate_bp: null,
        term_end: null,
        interest_kind: null,
        installment_cents: null,
        term_start: null,
        original_amount_cents: null,
      },
      {
        id: 'loan',
        interest_rate_bp: 450,
        term_end: '2030-01-01',
        interest_kind: null,
        installment_cents: null,
        term_start: null,
        original_amount_cents: null,
      },
    ]);
    // The new columns take values and keep their checks.
    accounts.update(
      opened.db,
      'loan',
      {
        interestKind: 'variable',
        installmentCents: 25_000,
        termStart: '2024-01-01',
        originalAmountCents: 600_000,
      },
      testCtx,
    );
    expect(accounts.get(opened.db, 'loan')).toMatchObject({
      interestKind: 'variable',
      installmentCents: 25_000,
      termStart: '2024-01-01',
      originalAmountCents: 600_000,
    });
    expect(() =>
      opened.sqlite.exec("UPDATE account SET interest_kind = 'floating' WHERE id = 'loan'"),
    ).toThrow(/CHECK/);
    expect(() =>
      opened.sqlite.exec("UPDATE account SET installment_cents = -1 WHERE id = 'loan'"),
    ).toThrow(/CHECK/);
    expect(() =>
      opened.sqlite.exec("UPDATE account SET term_start = 'soon' WHERE id = 'loan'"),
    ).toThrow(/CHECK/);
    // Target tiers work on the migrated database; a threshold exists once among live tiers.
    expect(listTargetTiers(opened.db)).toEqual([]);
    setTargetTiers(
      opened.db,
      [
        { upToCents: 100, targets: [{ assetClassId: 'ac', targetShareBp: 10_000 }] },
        { upToCents: null, targets: [{ assetClassId: 'ac', targetShareBp: 10_000 }] },
      ],
      testCtx,
    );
    expect(listTargetTiers(opened.db).map((t) => t.upToCents)).toEqual([100, null]);
    expect(() =>
      opened.sqlite.exec("INSERT INTO asset_target_tier (id, up_to_cents) VALUES ('dup', 100)"),
    ).toThrow(/UNIQUE/);
    expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(opened.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  } finally {
    opened.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
