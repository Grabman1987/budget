import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { defaultMigrationsFolder, migrateDatabase, openDatabase } from './client';

const TAG = '0061_split_purpose_category';

it('0061 adds a null purpose to existing splits without touching data and rolls back guarded', () => {
  const root = mkdtempSync(join(tmpdir(), 'budget-split-purpose-'));
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
      INSERT INTO account (id,name,type,role,on_budget,opening_date) VALUES ('a','Konto Muster','checking','budget',1,'2026-01-01');
      INSERT INTO category_group (id,name) VALUES ('g','Gruppe');
      INSERT INTO category (id,group_id,name,kind,class) VALUES ('c','g','Essen','variable','need'),('adv','g','Auslagen','advance',NULL);
      INSERT INTO account (id,name,type,role,on_budget,opening_date) VALUES ('a2','Konto Zwei','checking','budget',1,'2026-01-01');
      INSERT INTO contact (id,name) VALUES ('k','Kontakt Muster');
      INSERT INTO booking (id,account_id,date,amount_cents,currency) VALUES ('b','a','2026-01-05',-500,'EUR');
      INSERT INTO booking_split (id,booking_id,category_id,amount_cents) VALUES ('s','b','c',-500);
    `);
    // A few dozen synthetic splits: normal, contact share, transfer legs and income-type rows.
    for (let i = 0; i < 40; i++) {
      const kind = i % 4;
      const amount = kind === 3 ? 1000 + i : -(100 + i);
      opened.sqlite
        .prepare(
          'INSERT INTO booking (id,account_id,date,amount_cents,currency) VALUES (?,?,?,?,?)',
        )
        .run(`bk${i}`, kind === 2 ? 'a2' : 'a', '2026-02-01', amount, 'EUR');
      const cat = kind === 1 ? 'adv' : kind === 2 ? null : kind === 3 ? null : 'c';
      opened.sqlite
        .prepare(
          'INSERT INTO booking_split (id,booking_id,category_id,amount_cents,contact_id) VALUES (?,?,?,?,?)',
        )
        .run(`sp${i}`, `bk${i}`, cat, amount, kind === 1 ? 'k' : null);
    }
    const sql = (q: string) => opened.sqlite.prepare(q).all();
    const before = sql('SELECT * FROM booking_split') as Record<string, unknown>[];
    const totals = () =>
      sql('SELECT count(*) AS n, SUM(amount_cents) AS total FROM booking_split')[0] as {
        n: number;
        total: number;
      };
    const beforeTotals = totals();
    expect(beforeTotals.n).toBe(41);
    expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
    const migrations = (sql('SELECT count(*) AS n FROM __drizzle_migrations')[0] as { n: number })
      .n;
    migrateDatabase(opened.db);
    // Existing rows are unchanged apart from the new column, which stays null.
    expect(sql('SELECT * FROM booking_split')).toEqual(
      before.map((r) => ({ ...r, purpose_category_id: null })),
    );
    expect(totals()).toEqual(beforeTotals);
    expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
    // Idempotent: a second run changes nothing.
    migrateDatabase(opened.db);
    expect(totals()).toEqual(beforeTotals);
    expect(sql('SELECT * FROM booking_split')).toEqual(
      before.map((r) => ({ ...r, purpose_category_id: null })),
    );
    expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(() =>
      opened.sqlite.exec(
        "INSERT INTO booking_split (id,booking_id,category_id,amount_cents,purpose_category_id) VALUES ('x','b','adv',1,'missing')",
      ),
    ).toThrow(/FOREIGN KEY/);

    const rollback = readFileSync(join(folder, 'rollback', `${TAG}.sql`), 'utf8');
    // A recorded purpose blocks the rollback and leaves everything untouched.
    opened.sqlite.exec("UPDATE booking_split SET purpose_category_id = 'c' WHERE id = 's'");
    expect(() => opened.sqlite.transaction(() => opened.sqlite.exec(rollback))()).toThrow(/CHECK/);
    opened.sqlite.exec('UPDATE booking_split SET purpose_category_id = NULL');
    opened.sqlite.transaction(() => opened.sqlite.exec(rollback))();
    expect(sql('SELECT * FROM booking_split')).toEqual(before);
    expect(totals()).toEqual(beforeTotals);
    expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect((sql('SELECT count(*) AS n FROM __drizzle_migrations')[0] as { n: number }).n).toBe(
      migrations,
    );
  } finally {
    opened.close();
    rmSync(root, { recursive: true, force: true });
  }
});
