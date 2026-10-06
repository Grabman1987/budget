import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { defaultMigrationsFolder, migrateDatabase, openDatabase } from './client';

it('adds only the observation and gap tables to the predecessor, preserving the existing synthetic plan', () => {
  const source = defaultMigrationsFolder();
  const folder = mkdtempSync(join(tmpdir(), 'budget-snapshot-migration-'));
  const opened = openDatabase(':memory:');
  try {
    const journal = JSON.parse(readFileSync(join(source, 'meta', '_journal.json'), 'utf8'));
    const index = journal.entries.findIndex((e: { tag: string }) => e.tag === '0039_plan_snapshot');
    expect(index).toBeGreaterThan(0);
    const entries = journal.entries.slice(0, index);
    mkdirSync(join(folder, 'meta'));
    writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
    for (const e of entries)
      copyFileSync(join(source, `${e.tag}.sql`), join(folder, `${e.tag}.sql`));
    migrateDatabase(opened.db, folder);
    opened.sqlite.exec(
      "INSERT INTO category_group(id,name) VALUES ('g','Synthetic group'); INSERT INTO category(id,name,group_id,class) VALUES ('c','Synthetic category','g','need'); INSERT INTO envelope_month(category_id,month,assigned_cents) VALUES ('c','2026-09',12345);",
    );
    const before = opened.sqlite.prepare('SELECT * FROM envelope_month').all();
    const oldTables = opened.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all();
    migrateDatabase(opened.db);
    expect(opened.sqlite.prepare('SELECT * FROM envelope_month').all()).toEqual(before);
    expect(
      opened.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('plan_snapshot','plan_snapshot_gap') ORDER BY name",
        )
        .all(),
    ).toEqual(oldTables);
    expect(opened.sqlite.prepare('SELECT * FROM plan_snapshot').all()).toEqual([]);
    expect(() =>
      opened.sqlite.exec(
        "INSERT INTO plan_snapshot(id,month,day,planned_cents,spent_cents,projected_cents) VALUES ('bad','2026-09',15,1.5,0,0)",
      ),
    ).toThrow(/plan_snapshot_money_chk/);
  } finally {
    opened.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
