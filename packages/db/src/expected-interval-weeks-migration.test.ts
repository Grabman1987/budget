import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { defaultMigrationsFolder, migrateDatabase, openDatabase } from './client';

it('expected-interval-weeks migration only adds a nullable column and keeps stored rows verbatim', () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-interval-weeks-migration-'));
  const old = join(dir, 'old');
  mkdirSync(join(old, 'meta'), { recursive: true });
  const folder = defaultMigrationsFolder();
  const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  const added = journal.entries.find((e) => e.tag === '0043_expected_interval_weeks')!;
  const previous = { ...journal, entries: journal.entries.filter((e) => e.idx < added.idx) };
  writeFileSync(join(old, 'meta/_journal.json'), JSON.stringify(previous));
  for (const e of previous.entries)
    copyFileSync(join(folder, e.tag + '.sql'), join(old, e.tag + '.sql'));
  const opened = openDatabase(':memory:');
  try {
    migrateDatabase(opened.db, old);
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date) VALUES ('a','Konto Muster','cash','budget',1,'2026-01-01');
      INSERT INTO expected_payment (id,name,account_id,rhythm,due_day,start_date) VALUES ('w','Woche Muster','a','weekly',1,'2026-01-02');
      INSERT INTO expected_payment (id,name,account_id,rhythm,due_day) VALUES ('m','Monat Muster','a','monthly',1);
    `);
    const rows = () => opened.sqlite.prepare('SELECT * FROM expected_payment ORDER BY id').all();
    const before = rows() as Record<string, unknown>[];
    migrateDatabase(opened.db);
    // Every old row is the same plus the new column, empty: weekly keeps meaning every week.
    expect(rows()).toEqual(before.map((r) => ({ ...r, interval_weeks: null })));
    opened.sqlite.exec("UPDATE expected_payment SET interval_weeks=2 WHERE id='w'");
    expect(
      opened.sqlite.prepare("SELECT interval_weeks FROM expected_payment WHERE id='w'").get(),
    ).toEqual({ interval_weeks: 2 });
    expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
  } finally {
    opened.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
