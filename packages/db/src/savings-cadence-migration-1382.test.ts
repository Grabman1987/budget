import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { defaultMigrationsFolder, migrateDatabase, openDatabase } from './client';

const TAG = '0060_savings_cadence';

it('0060 keeps existing savings plans monthly, enforces the cadence pairing, and rolls back guarded', () => {
  const root = mkdtempSync(join(tmpdir(), 'budget-savings-cadence-'));
  const folder = defaultMigrationsFolder();
  const old = join(root, 'old');
  mkdirSync(join(old, 'meta'), { recursive: true });
  const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  const added = journal.entries.find((e) => e.tag === TAG)!;
  const previous = { ...journal, entries: journal.entries.filter((e) => e.idx < added.idx) };
  writeFileSync(join(old, 'meta/_journal.json'), JSON.stringify(previous));
  for (const e of previous.entries)
    copyFileSync(join(folder, e.tag + '.sql'), join(old, e.tag + '.sql'));
  const opened = openDatabase(':memory:');
  try {
    migrateDatabase(opened.db, old);
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date) VALUES ('d','Depot Muster','brokerage','investment',0,'2026-01-01');
      INSERT INTO security (id,name,kind) VALUES ('f','Fonds Muster','fund');
      INSERT INTO savings_plan (id,security_id,account_id,amount_cents,day_of_month,valid_from)
        VALUES ('p','f','d',10000,15,'2026-01-01');
    `);
    const sql = (q: string) => opened.sqlite.prepare(q).all();
    const before = sql('SELECT * FROM savings_plan') as Record<string, unknown>[];
    const migrations = (sql('SELECT count(*) AS n FROM __drizzle_migrations')[0] as { n: number })
      .n;
    migrateDatabase(opened.db);
    expect(sql('SELECT * FROM savings_plan')).toEqual(
      before.map((r) => ({ ...r, cadence: 'monthly', days_of_month: null, interval_weeks: null })),
    );
    const insert = (cadence: string, days: string | null, weeks: number | null) =>
      opened.sqlite
        .prepare(
          `INSERT INTO savings_plan (id,security_id,account_id,amount_cents,day_of_month,cadence,days_of_month,interval_weeks,valid_from)
           VALUES (lower(hex(randomblob(4))),'f','d',500,2,?,?,?,'2026-01-02')`,
        )
        .run(cadence, days, weeks);
    expect(() => insert('yearly', null, null)).toThrow(/CHECK/);
    expect(() => insert('days', null, null)).toThrow(/CHECK/);
    expect(() => insert('monthly', '2,9', null)).toThrow(/CHECK/);
    expect(() => insert('weeks', null, null)).toThrow(/CHECK/);
    expect(() => insert('weeks', null, 5)).toThrow(/CHECK/);
    expect(() => insert('monthly', null, 2)).toThrow(/CHECK/);
    insert('days', '2,9,16,23', null);
    insert('weeks', null, 2);
    expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);

    // An older rollback must never cross a later applied migration: undo the later ones first.
    for (const later of journal.entries.filter((e) => e.idx > added.idx).reverse())
      opened.sqlite.transaction(() =>
        opened.sqlite.exec(readFileSync(join(folder, 'rollback', `${later.tag}.sql`), 'utf8')),
      )();
    const rollback = readFileSync(join(folder, 'rollback', `${TAG}.sql`), 'utf8');
    // Retained data (non-monthly plans) blocks the rollback and leaves everything untouched.
    expect(() => opened.sqlite.transaction(() => opened.sqlite.exec(rollback))()).toThrow(/CHECK/);
    opened.sqlite.exec("DELETE FROM savings_plan WHERE cadence <> 'monthly'");
    opened.sqlite.transaction(() => opened.sqlite.exec(rollback))();
    expect(sql('SELECT * FROM savings_plan')).toEqual(before);
    expect((sql('SELECT count(*) AS n FROM __drizzle_migrations')[0] as { n: number }).n).toBe(
      migrations,
    );
  } finally {
    opened.close();
    rmSync(root, { recursive: true, force: true });
  }
});
