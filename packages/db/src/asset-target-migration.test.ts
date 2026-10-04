import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { defaultMigrationsFolder, migrateDatabase, openDatabase } from './client';
import { reportPortfolioFixture, REPORT_TODAY } from './repos/portfolio-report-fixture';
import { holdingValuesAsOf, netWorthAsOf } from './repos/portfolio';
import { resolvePortfolioRiskPolicy } from './repos/portfolio-risk-policy';

it('0035 is generated from main 0034, preserves every existing row/value, repeats safely and restores a SQLite backup', async () => {
  const folder = defaultMigrationsFolder();
  const snap = (n: string) =>
    JSON.parse(readFileSync(join(folder, `meta/${n}_snapshot.json`), 'utf8')) as {
      id: string;
      prevId: string;
      tables: Record<string, unknown>;
    };
  const main = snap('0034'),
    next = snap('0035');
  expect(next.prevId).toBe(main.id);
  for (const [table, definition] of Object.entries(main.tables))
    expect(next.tables[table]).toEqual(definition);
  const dir = mkdtempSync(join(tmpdir(), 'budget-target-migration-'));
  const old = join(dir, 'main');
  mkdirSync(join(old, 'meta'), { recursive: true });
  const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  const oldJournal = { ...journal, entries: journal.entries.filter((e) => e.idx < 35) };
  expect(oldJournal.entries.at(-1)!.tag).toBe('0034_loan_planning');
  writeFileSync(join(old, 'meta/_journal.json'), JSON.stringify(oldJournal));
  for (const entry of oldJournal.entries)
    copyFileSync(join(folder, entry.tag + '.sql'), join(old, entry.tag + '.sql'));
  const opened = openDatabase(join(dir, 'synthetic.sqlite'));
  let restored: ReturnType<typeof openDatabase> | undefined;
  try {
    migrateDatabase(opened.db, old);
    reportPortfolioFixture(opened);
    const tables = (
      opened.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__%' ORDER BY name",
        )
        .all() as { name: string }[]
    ).map((t) => t.name);
    const rows = (database = opened) =>
      tables.map((table) =>
        database.sqlite.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all(),
      );
    const before = rows(),
      worth = netWorthAsOf(opened.db, REPORT_TODAY),
      values = holdingValuesAsOf(opened.db, REPORT_TODAY);
    await opened.sqlite.backup(join(dir, 'before.sqlite'));
    migrateDatabase(opened.db);
    expect(rows()).toEqual(before);
    expect(netWorthAsOf(opened.db, REPORT_TODAY)).toEqual(worth);
    expect(holdingValuesAsOf(opened.db, REPORT_TODAY)).toEqual(values);
    expect(
      resolvePortfolioRiskPolicy(opened.db, REPORT_TODAY).targets.map((t) => t.targetBp),
    ).toEqual([6000, 4000]);
    expect(opened.sqlite.prepare('SELECT * FROM asset_target_version').all()).toEqual([]);
    expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
    migrateDatabase(opened.db);
    expect(rows()).toEqual(before);
    restored = openDatabase(join(dir, 'before.sqlite'));
    migrateDatabase(restored.db);
    expect(rows(restored)).toEqual(before);
    expect(netWorthAsOf(restored.db, REPORT_TODAY)).toEqual(worth);
    expect(restored.sqlite.pragma('foreign_key_check')).toEqual([]);
  } finally {
    restored?.close();
    opened.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
