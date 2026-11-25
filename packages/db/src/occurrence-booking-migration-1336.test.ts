import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { expect, it } from 'vitest';
import { defaultMigrationsFolder, migrateDatabase, openDatabase } from './client';

const TAG = '0057_occurrence_booking_multi';

it('migration 0057 drops only the unique booking index: rows unchanged, idempotent, FK clean', () => {
  const root = mkdtempSync(join(tmpdir(), 'synthetic-occurrence-multi-'));
  const source = defaultMigrationsFolder();
  const old = join(root, 'through-0056');
  mkdirSync(join(old, 'meta'), { recursive: true });
  const journal = JSON.parse(readFileSync(join(source, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string }[];
  };
  const previous = { ...journal, entries: journal.entries.filter((e) => e.tag < TAG) };
  expect(previous.entries.at(-1)?.tag).toBe('0056_ledger_version');
  writeFileSync(join(old, 'meta', '_journal.json'), JSON.stringify(previous));
  for (const e of previous.entries)
    copyFileSync(join(source, `${e.tag}.sql`), join(old, `${e.tag}.sql`));
  const opened = openDatabase(join(root, 'predecessor.sqlite'));
  try {
    opened.sqlite.pragma('foreign_keys = OFF');
    migrate(drizzle(opened.sqlite), { migrationsFolder: old });
    const index = () =>
      opened.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE name = 'occurrence_booking_uq'")
        .all();
    expect(index()).toHaveLength(1);
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date) VALUES ('a','Konto Muster','cash','budget',1,'2026-01-01');
      INSERT INTO booking (id,account_id,date,amount_cents,status) VALUES ('b','a','2026-10-01',1234,'confirmed');
      INSERT INTO booking_split (id,booking_id,amount_cents) VALUES ('s','b',1234);
      INSERT INTO expected_payment (id,name,account_id,rhythm,due_day) VALUES ('p','Zahlung Muster','a','monthly',1);
      INSERT INTO expected_occurrence (id,expected_payment_id,due_date,expected_amount_cents,status,booking_id) VALUES ('o1','p','2026-10-01',1234,'received','b');
      INSERT INTO expected_occurrence (id,expected_payment_id,due_date,expected_amount_cents,status) VALUES ('o2','p','2026-11-01',1234,'expected');
    `);
    const tables = ['expected_payment', 'expected_occurrence', 'booking', 'booking_split'];
    const rows = () =>
      tables.map((t) => opened.sqlite.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all());
    const before = rows();
    const full = join(root, 'full');
    mkdirSync(join(full, 'meta'), { recursive: true });
    writeFileSync(
      join(full, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: journal.entries.filter((e) => e.tag <= TAG) }),
    );
    for (const e of journal.entries.filter((x) => x.tag <= TAG))
      copyFileSync(join(source, `${e.tag}.sql`), join(full, `${e.tag}.sql`));
    migrateDatabase(opened.db, full);
    migrateDatabase(opened.db, full);
    expect(rows()).toEqual(before);
    expect(index()).toHaveLength(0);
    expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
    // A booking may now carry two live links.
    opened.sqlite.exec(
      "UPDATE expected_occurrence SET status='received', booking_id='b' WHERE id='o2'",
    );
  } finally {
    opened.close();
    rmSync(root, { recursive: true, force: true });
  }
});
