import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { defaultMigrationsFolder, migrateDatabase, openDatabase } from './client';

it('adds loan planning tables without touching existing accounts and enforces its checks', () => {
  const source = defaultMigrationsFolder();
  const folder = mkdtempSync(join(tmpdir(), 'budget-loan-planning-migration-'));
  const opened = openDatabase(':memory:');
  try {
    const journal = JSON.parse(readFileSync(join(source, 'meta', '_journal.json'), 'utf8')) as {
      entries: { tag: string }[];
    };
    const index = journal.entries.findIndex((e) => e.tag.endsWith('_loan_planning'));
    expect(index).toBeGreaterThan(0);
    const entries = journal.entries.slice(0, index);
    mkdirSync(join(folder, 'meta'));
    writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
    for (const entry of entries)
      copyFileSync(join(source, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
    migrateDatabase(opened.db, folder);
    opened.sqlite.exec(`
      INSERT INTO account (id, name, type, role, on_budget, opening_date, opening_balance_cents, interest_rate_bp, sort_order)
        VALUES ('loan', 'Kredit', 'loan', 'debt', 0, '2023-10-01', -500000, 450, 1);
    `);
    migrateDatabase(opened.db);
    migrateDatabase(opened.db); // Restarting must not repeat the DDL.
    expect(opened.sqlite.prepare('SELECT id, interest_rate_bp FROM account').all()).toEqual([
      { id: 'loan', interest_rate_bp: 450 },
    ]);
    const change = (id: string, day: string, rate: number) =>
      opened.sqlite.exec(
        `INSERT INTO loan_rate_change (id, account_id, valid_from, rate_bp) VALUES ('${id}', 'loan', '${day}', ${String(rate)})`,
      );
    change('a', '2027-01-01', 300);
    // One live change per loan and day; a soft delete frees the day.
    expect(() => change('b', '2027-01-01', 400)).toThrow(/UNIQUE/);
    opened.sqlite.exec(
      "UPDATE loan_rate_change SET deleted_at = '2026-10-01T00:00:00Z' WHERE id = 'a'",
    );
    change('b', '2027-01-01', 400);
    expect(() => change('c', 'tomorrow', 400)).toThrow(/CHECK/);
    expect(() => change('c', '2027-02-01', 100_001)).toThrow(/CHECK/);
    expect(() => change('c', '2027-02-01', -1)).toThrow(/CHECK/);
    expect(() =>
      opened.sqlite.exec(
        "INSERT INTO loan_scenario (id, account_id, name, measures_json) VALUES ('s', 'loan', 'x', 'not json')",
      ),
    ).toThrow(/CHECK/);
    expect(() =>
      opened.sqlite.exec(
        "INSERT INTO loan_scenario (id, account_id, name, measures_json) VALUES ('s', 'missing', 'x', '[]')",
      ),
    ).toThrow(/FOREIGN KEY/);
    opened.sqlite.exec(
      "INSERT INTO loan_scenario (id, account_id, name, measures_json) VALUES ('s', 'loan', 'x', '[]')",
    );
  } finally {
    opened.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
