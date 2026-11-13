import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  defaultMigrationsFolder,
  migrateDatabase,
  openDatabase,
  type OpenedDatabase,
} from './client';

const TAG = '0053_payslip_wage_lines';
const NEW_TABLES = ['payslip_wage_line', 'payslip_wage_read', 'wage_component_mapping'];

/** Migration folder that stops after 0052: the genuine predecessor schema. */
function predecessorFolder(root: string): string {
  const source = defaultMigrationsFolder();
  const folder = join(root, 'through-0052');
  mkdirSync(join(folder, 'meta'), { recursive: true });
  const journal = JSON.parse(readFileSync(join(source, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string }[];
  };
  journal.entries = journal.entries.filter((e) => e.tag < TAG);
  expect(journal.entries.at(-1)?.tag).toBe('0052_contact_merge');
  writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify(journal));
  for (const e of journal.entries)
    copyFileSync(join(source, `${e.tag}.sql`), join(folder, `${e.tag}.sql`));
  return folder;
}

const tableNames = (o: OpenedDatabase) =>
  (
    o.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((r) => r.name);
/** Every row of every predecessor table, all columns, in rowid order. */
const dump = (o: OpenedDatabase, tables: string[]) =>
  Object.fromEntries(
    tables.map((name) => [name, o.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]),
  );
const schemaSql = (o: OpenedDatabase, tables: string[]) =>
  o.sqlite
    .prepare(
      `SELECT type, name, sql FROM sqlite_master WHERE tbl_name IN (${tables.map(() => '?').join(',')}) ORDER BY name`,
    )
    .all(...tables);
const count = (o: OpenedDatabase, table: string) =>
  (o.sqlite.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n;
const applied = (o: OpenedDatabase) => count(o, '__drizzle_migrations');

it('#1066 migration 0053 on a populated 0052 database: additive only, rollback exact and guarded', () => {
  const root = mkdtempSync(join(tmpdir(), 'synthetic-payslip-wage-1066-'));
  let opened: OpenedDatabase | undefined;
  try {
    const db = (opened = openDatabase(join(root, 'predecessor.sqlite')));
    migrateDatabase(opened.db, predecessorFolder(root));
    for (const t of NEW_TABLES) expect(tableNames(opened)).not.toContain(t);
    // Synthetic rows through raw SQL only; invented employer, wage types and amounts.
    opened.sqlite.exec(`
      INSERT INTO contact (id, name) VALUES ('emp', 'Beispiel Arbeitgeber GmbH');
      INSERT INTO receipt (id, storage_key, mime, size_bytes, sha256, original_filename)
        VALUES ('r1', 'synthetic-key-1', 'application/pdf', 1234, 'aa', 'synthetic-203001.pdf'),
               ('r2', 'synthetic-key-2', 'application/pdf', 2345, 'bb', 'synthetic-203002.pdf');
      INSERT INTO payslip (id, month, kind, gross_cents, sv_cents, tax_cents, special_type, net_cents, employer_contact_id, receipt_id)
        VALUES ('p1', '2030-01', 'regular', 400000, 70000, 50000, NULL, 280000, 'emp', 'r1'),
               ('p2', '2030-02', 'special', 400000, 68000, 24000, 'salary14', 308000, 'emp', 'r2'),
               ('p3', '2030-03', 'regular', 410000, 71000, 52000, NULL, 287000, NULL, NULL);
      INSERT INTO payslip_line (id, payslip_id, section, label, amount_cents, sort_order)
        VALUES ('l1', 'p1', 'deduction', 'Kantine', 1000, 0),
               ('l2', 'p1', 'reimbursement', 'Telearbeit', 2500, 1),
               ('l3', 'p3', 'earning', 'Nachzahlung', 1500, 0);
      INSERT INTO payslip_line (id, payslip_id, section, label, amount_cents, sort_order, deleted_at)
        VALUES ('l4', 'p3', 'deduction', 'Alt', 100, 1, '2030-04-01T00:00:00.000Z');
      INSERT INTO audit_log (id, actor, action, entity_type, entity_id, after_json, group_id)
        VALUES ('au1', 'synthetic', 'create', 'payslip', 'p1', '{"id":"p1","gross_cents":400000}', 'g1'),
               ('au2', 'synthetic', 'create', 'payslip_line', 'l1', '{"id":"l1"}', 'g1');
    `);
    const predecessorTables = tableNames(opened);
    const before = dump(opened, predecessorTables);
    const beforeSchema = schemaSql(opened, predecessorTables);
    const beforeMigrations = applied(opened);
    expect(beforeMigrations).toBe(53);
    expect(
      Object.fromEntries(
        ['contact', 'receipt', 'payslip', 'payslip_line', 'audit_log'].map((t) => [
          t,
          count(opened!, t),
        ]),
      ),
    ).toEqual({ contact: 1, receipt: 2, payslip: 3, payslip_line: 4, audit_log: 2 });

    migrateDatabase(opened.db); // applies exactly 0053
    migrateDatabase(opened.db); // idempotent
    expect(applied(opened)).toBe(54);
    for (const t of NEW_TABLES) {
      expect(tableNames(opened)).toContain(t);
      expect(count(opened, t)).toBe(0);
    }
    // Every predecessor table: same rows, same values, same DDL (no rebuild, no new column).
    expect(dump(opened, predecessorTables)).toEqual(before);
    expect(schemaSql(opened, predecessorTables)).toEqual(beforeSchema);
    expect(
      Object.fromEntries(
        ['contact', 'receipt', 'payslip', 'payslip_line', 'audit_log'].map((t) => [
          t,
          count(opened!, t),
        ]),
      ),
    ).toEqual({ contact: 1, receipt: 2, payslip: 3, payslip_line: 4, audit_log: 2 });
    expect(opened.sqlite.pragma('foreign_key_check')).toEqual([]);
    expect(opened.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);

    // Constraints of the new tables.
    expect(() =>
      opened!.sqlite.exec(
        "INSERT INTO payslip_wage_read (id, payslip_id, origin, parser_version, line_check, sv_current_cents) VALUES ('x', 'p1', 'reread', 3, 'ok', 1)",
      ),
    ).toThrow(/CHECK/);
    expect(() =>
      opened!.sqlite.exec(
        "INSERT INTO wage_component_mapping (id, wage_code, mapping_key, component) VALUES ('x', '105', 'wrong', 'base')",
      ),
    ).toThrow(/CHECK/);
    expect(() =>
      opened!.sqlite.exec(
        "INSERT INTO payslip_wage_read (id, payslip_id, origin, parser_version, line_check) VALUES ('x', 'missing', 'reread', 3, 'ok')",
      ),
    ).toThrow(/FOREIGN KEY/);

    const rollback = readFileSync(
      join(defaultMigrationsFolder(), 'rollback', `${TAG}.sql`),
      'utf8',
    );
    const run = (o: OpenedDatabase) => o.sqlite.transaction(() => o.sqlite.exec(rollback))();

    // Rollback on unused tables restores the exact predecessor; forward again works.
    run(opened);
    expect(applied(opened)).toBe(53);
    expect(tableNames(opened)).toEqual(predecessorTables);
    expect(dump(opened, predecessorTables)).toEqual(before);
    expect(schemaSql(opened, predecessorTables)).toEqual(beforeSchema);
    migrateDatabase(opened.db);
    expect(applied(opened)).toBe(54);

    // Stored wage data refuses the downgrade atomically (bytes unchanged)...
    opened.sqlite.exec(`
      INSERT INTO payslip_wage_read (id, payslip_id, receipt_id, origin, parser_version, line_check)
        VALUES ('w1', 'p1', 'r1', 'reread', 3, 'ok');
      INSERT INTO payslip_wage_line (id, read_id, payslip_id, line_order, wage_code, label, section, amount_cents)
        VALUES ('wl1', 'w1', 'p1', 0, '105', 'Gehalt', 'earning', 400000);
    `);
    let bytes = opened.sqlite.serialize();
    expect(() => run(db)).toThrow();
    expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
    // ...and so does audited intent once the rows are gone, and a later applied migration.
    opened.sqlite.exec(`
      DELETE FROM payslip_wage_line; DELETE FROM payslip_wage_read;
      INSERT INTO audit_log (id, actor, action, entity_type, entity_id, after_json, group_id)
        VALUES ('au3', 'synthetic', 'create', 'wage_component_mapping', 'm1', '{"id":"m1"}', 'g3');
    `);
    bytes = opened.sqlite.serialize();
    expect(() => run(db)).toThrow();
    expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
    opened.sqlite.exec(`
      DELETE FROM audit_log WHERE id = 'au3';
      INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('synthetic-later', 9999999999999);
    `);
    bytes = opened.sqlite.serialize();
    expect(() => run(db)).toThrow();
    expect(opened.sqlite.serialize().equals(bytes)).toBe(true);
  } finally {
    opened?.close();
    rmSync(root, { recursive: true, force: true });
  }
});
