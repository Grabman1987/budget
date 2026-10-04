import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { defaultMigrationsFolder, migrateDatabase, openDatabase } from './client';
import { exposuresAsOf, splitAssetExposure } from './repos/asset-exposure';
import { holdingValuesAsOf } from './repos/portfolio';

it('migrates the complete main schema without changing per-security class cents or any source rows; repeat and backup restore are safe', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-exposure-migration-'));
  const mainFolder = join(dir, 'main');
  mkdirSync(join(mainFolder, 'meta'), { recursive: true });
  const folder = defaultMigrationsFolder();
  const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  const mainJournal = { ...journal, entries: journal.entries.filter((e) => e.idx < 30) };
  expect(mainJournal.entries).toHaveLength(30);
  writeFileSync(join(mainFolder, 'meta/_journal.json'), JSON.stringify(mainJournal));
  for (const entry of mainJournal.entries)
    copyFileSync(join(folder, `${entry.tag}.sql`), join(mainFolder, `${entry.tag}.sql`));
  const opened = openDatabase(join(dir, 'synthetic.sqlite'));
  let restored: ReturnType<typeof openDatabase> | undefined;
  try {
    migrateDatabase(opened.db, mainFolder);
    opened.sqlite.exec(`
      INSERT INTO account (id, name, type, role, on_budget, opening_date)
        VALUES ('depot', 'Synthetisches Depot', 'brokerage', 'investment', 0, '2025-01-01');
      INSERT INTO asset_class (id, name) VALUES ('a', 'Klasse A'), ('b', 'Klasse B');
      INSERT INTO asset_class_target (id, asset_class_id, valid_from, target_share_bp)
        VALUES ('ta', 'a', '2025-01-01', 6000), ('tb', 'b', '2025-01-01', 4000);
      INSERT INTO security (id, name, kind, asset_class_id, created_at) VALUES
        ('s1', 'Produkt A', 'etf', 'a', '2026-09-01T00:00:00.000Z'),
        ('s2', 'Produkt B', 'bond', 'b', '2026-09-01T00:00:00.000Z'),
        ('s3', 'Ohne Klasse', 'other', NULL, '2026-09-01T00:00:00.000Z'),
        ('s4', 'Ohne Bestand', 'etf', 'a', '2026-08-03T00:00:00.000Z');
      INSERT INTO holding (id, security_id, account_id, as_of, units_e8, cost_basis_cents) VALUES
        ('h1', 's1', 'depot', '2025-12-31', 100000000, 100),
        ('h3', 's3', 'depot', '2025-12-31', 100000000, 100);
      INSERT INTO trade (id, security_id, account_id, date, kind, units_e8, amount_cents) VALUES
        ('t2', 's2', 'depot', '2025-03-01', 'delivery_in', 100000000, 103);
      INSERT INTO price (security_id, date, price_micro, currency, source) VALUES
        ('s1', '2025-12-31', 1010000, 'EUR', 'manual'),
        ('s2', '2025-12-31', 1030000, 'EUR', 'manual'),
        ('s3', '2025-12-31', 1070000, 'EUR', 'manual');
    `);
    const day = '2025-12-31';
    const valuesBefore = holdingValuesAsOf(opened.db, day);
    expect(valuesBefore.map((h) => h.valueCents).sort((a, b) => a - b)).toEqual([101, 103, 107]);
    const oldClass = new Map(
      (
        opened.sqlite.prepare('SELECT id, asset_class_id FROM security').all() as {
          id: string;
          asset_class_id: string | null;
        }[]
      ).map((r) => [r.id, r.asset_class_id]),
    );
    const tables = [
      'security',
      'trade',
      'holding',
      'price',
      'asset_class',
      'asset_class_target',
      'account',
      'audit_log',
    ];
    const sourceRows = () =>
      tables.map((name) => opened.sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all());
    const before = sourceRows();
    await opened.sqlite.backup(join(dir, 'before.sqlite'));
    migrateDatabase(opened.db);
    expect(sourceRows()).toEqual(before);
    expect(holdingValuesAsOf(opened.db, day)).toEqual(valuesBefore);
    const exposure = exposuresAsOf(opened.db, day);
    const parts = valuesBefore.flatMap((h) => {
      const splits = splitAssetExposure(h.valueCents, exposure.get(h.securityId)?.weights ?? []);
      expect(splits).toEqual([
        { assetClassId: oldClass.get(h.securityId)!, weightBp: 10000, valueCents: h.valueCents },
      ]);
      return splits;
    });
    expect(parts.reduce((a, p) => a + p.valueCents, 0)).toBe(311);
    const versions = opened.sqlite
      .prepare('SELECT * FROM security_exposure_version ORDER BY security_id')
      .all();
    const weights = opened.sqlite
      .prepare('SELECT * FROM security_asset_exposure ORDER BY security_id')
      .all();
    expect(versions).toHaveLength(3);
    expect(weights).toHaveLength(3);
    expect(exposure.get('s1')).toMatchObject({
      validFrom: '2025-12-31',
      source: 'legacy_assumed_from_first_record',
    });
    expect(exposure.get('s2')).toMatchObject({ validFrom: '2025-03-01' });
    expect(exposuresAsOf(opened.db, '2026-08-03').get('s4')).toMatchObject({
      validFrom: '2026-08-03',
    });
    migrateDatabase(opened.db);
    expect(
      opened.sqlite.prepare('SELECT * FROM security_exposure_version ORDER BY security_id').all(),
    ).toEqual(versions);
    expect(
      opened.sqlite.prepare('SELECT * FROM security_asset_exposure ORDER BY security_id').all(),
    ).toEqual(weights);
    expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
    restored = openDatabase(join(dir, 'before.sqlite'));
    expect(
      restored.sqlite
        .prepare("SELECT count(*) n FROM sqlite_master WHERE name = 'security_asset_exposure'")
        .get(),
    ).toEqual({ n: 0 });
    expect(holdingValuesAsOf(restored.db, day)).toEqual(valuesBefore);
    migrateDatabase(restored.db);
    expect(holdingValuesAsOf(restored.db, day)).toEqual(valuesBefore);
    expect(restored.sqlite.pragma('foreign_key_check')).toEqual([]);
  } finally {
    restored?.close();
    opened.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
