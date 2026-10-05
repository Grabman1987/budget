import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { defaultMigrationsFolder, migrateDatabase, openDatabase } from './client';

it('weekly migration preserves stored schedules, versions, links, bookings and audit verbatim', () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-weekly-migration-'));
  const old = join(dir, 'old');
  mkdirSync(join(old, 'meta'), { recursive: true });
  const folder = defaultMigrationsFolder();
  const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  const previous = { ...journal, entries: journal.entries.filter((e) => e.idx < 36) };
  writeFileSync(join(old, 'meta/_journal.json'), JSON.stringify(previous));
  for (const e of previous.entries)
    copyFileSync(join(folder, e.tag + '.sql'), join(old, e.tag + '.sql'));
  const opened = openDatabase(':memory:');
  try {
    migrateDatabase(opened.db, old);
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date) VALUES ('a','Konto Muster','cash','budget',1,'2026-01-01');
      INSERT INTO booking (id,account_id,date,amount_cents,status,income_next_month) VALUES ('b','a','2026-10-01',1234,'pending',1);
      INSERT INTO booking_split (id,booking_id,amount_cents) VALUES ('s','b',1234);
      INSERT INTO expected_payment (id,name,account_id,rhythm,due_day) VALUES ('p','Zahlung Muster','a','quarterly',1);
      INSERT INTO expected_payment_version (id,expected_payment_id,valid_from,amount_cents) VALUES ('v','p','2026-01-01',1234);
      INSERT INTO expected_occurrence (id,expected_payment_id,due_date,expected_amount_cents,status,booking_id) VALUES ('o','p','2026-10-01',-1234,'received','b');
    `);
    const tables = [
      'account',
      'booking',
      'booking_split',
      'expected_payment',
      'expected_payment_version',
      'expected_occurrence',
      'audit_log',
    ];
    const rows = () =>
      tables.map((t) => opened.sqlite.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all());
    const before = rows();
    migrateDatabase(opened.db);
    expect(rows()).toEqual(before);
    expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
    opened.sqlite.exec(
      "UPDATE expected_payment SET rhythm='weekly', start_date='2026-10-01' WHERE id='p'",
    );
    migrateDatabase(opened.db);
    expect(opened.sqlite.prepare("SELECT rhythm FROM expected_payment WHERE id='p'").get()).toEqual(
      { rhythm: 'weekly' },
    );
  } finally {
    opened.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
