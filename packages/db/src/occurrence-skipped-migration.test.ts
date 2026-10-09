import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { defaultMigrationsFolder, migrateDatabase, openDatabase } from './client';

it('occurrence-skipped migration keeps stored occurrences, links and audit verbatim and accepts the new status', () => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-occurrence-skipped-migration-'));
  const old = join(dir, 'old');
  mkdirSync(join(old, 'meta'), { recursive: true });
  const folder = defaultMigrationsFolder();
  const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  const previous = { ...journal, entries: journal.entries.filter((e) => e.idx < 41) };
  writeFileSync(join(old, 'meta/_journal.json'), JSON.stringify(previous));
  for (const e of previous.entries)
    copyFileSync(join(folder, e.tag + '.sql'), join(old, e.tag + '.sql'));
  const opened = openDatabase(':memory:');
  try {
    migrateDatabase(opened.db, old);
    opened.sqlite.exec(`
      INSERT INTO account (id,name,type,role,on_budget,opening_date) VALUES ('a','Konto Muster','cash','budget',1,'2026-01-01');
      INSERT INTO booking (id,account_id,date,amount_cents,status) VALUES ('b','a','2026-10-01',-1234,'pending');
      INSERT INTO booking_split (id,booking_id,amount_cents) VALUES ('s','b',-1234);
      INSERT INTO expected_payment (id,name,account_id,rhythm,due_day) VALUES ('p','Zahlung Muster','a','monthly',1);
      INSERT INTO expected_occurrence (id,expected_payment_id,due_date,expected_amount_cents,status,booking_id) VALUES ('o1','p','2026-10-01',-1234,'received','b');
      INSERT INTO expected_occurrence (id,expected_payment_id,due_date,expected_amount_cents,status) VALUES ('o2','p','2026-11-01',-1234,'missed');
      INSERT INTO expected_occurrence (id,expected_payment_id,due_date,expected_amount_cents,status,deleted_at) VALUES ('o3','p','2026-12-01',-1234,'expected','2026-10-02T00:00:00.000Z');
    `);
    const tables = ['expected_payment', 'expected_occurrence', 'booking', 'audit_log'];
    const rows = () =>
      tables.map((t) => opened.sqlite.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all());
    const before = rows();
    expect(() =>
      opened.sqlite.exec("UPDATE expected_occurrence SET status='skipped' WHERE id='o2'"),
    ).toThrow();
    migrateDatabase(opened.db);
    // Later migrations may add columns (0043: expected_payment.interval_weeks, empty for old rows).
    expect(rows()).toEqual(
      before.map((t, i) =>
        tables[i] === 'expected_payment'
          ? (t as Record<string, unknown>[]).map((r) => ({ ...r, interval_weeks: null }))
          : t,
      ),
    );
    expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
    opened.sqlite.exec("UPDATE expected_occurrence SET status='skipped' WHERE id='o2'");
    expect(
      opened.sqlite.prepare("SELECT status FROM expected_occurrence WHERE id='o2'").get(),
    ).toEqual({ status: 'skipped' });
    // The other rules still hold: a skipped row has no booking, unknown statuses stay refused,
    // and the unique (payment, due date) and booking indexes survived the table rebuild.
    expect(() =>
      opened.sqlite.exec("UPDATE expected_occurrence SET booking_id='b' WHERE id='o2'"),
    ).toThrow();
    expect(() =>
      opened.sqlite.exec("UPDATE expected_occurrence SET status='gone' WHERE id='o2'"),
    ).toThrow();
    expect(() =>
      opened.sqlite.exec(
        "INSERT INTO expected_occurrence (id,expected_payment_id,due_date,expected_amount_cents) VALUES ('dup','p','2026-11-01',-1234)",
      ),
    ).toThrow();
    expect(() =>
      opened.sqlite.exec(
        "INSERT INTO expected_occurrence (id,expected_payment_id,due_date,expected_amount_cents,status,booking_id) VALUES ('dup2','p','2027-01-01',-1234,'received','b')",
      ),
    ).toThrow();
  } finally {
    opened.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
