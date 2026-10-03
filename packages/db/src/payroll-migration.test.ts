import { readMigrationFiles } from 'drizzle-orm/migrator';
import { describe, expect, it } from 'vitest';
import { defaultMigrationsFolder, openDatabase } from './client';
import { auditLog, payslipLine } from './schema';

const PAYROLL_MIGRATION = 21;

describe('payroll migration 0021', () => {
  it('retains captured payslips, lines, projects and audit history while extending the schema', () => {
    const { db, sqlite, close } = openDatabase(':memory:');
    try {
      const migrations = readMigrationFiles({ migrationsFolder: defaultMigrationsFolder() });
      expect(migrations.length).toBeGreaterThanOrEqual(PAYROLL_MIGRATION + 1);
      for (const migration of migrations.slice(0, PAYROLL_MIGRATION))
        for (const statement of migration.sql) sqlite.exec(statement);
      sqlite.exec(`
        INSERT INTO project (id, name) VALUES ('p1', 'Synthetisches Projekt');
        INSERT INTO payslip (id, month, kind, gross_cents, net_cents)
          VALUES ('s1', '2026-09', 'regular', 10000, 7000);
        INSERT INTO payslip_line (id, payslip_id, section, label, amount_cents, sort_order)
          VALUES ('l1', 's1', 'earning', 'Synthetischer Bezug', 10000, 0),
                 ('l2', 's1', 'deduction', 'Synthetischer Abzug', 3000, 1);
        INSERT INTO audit_log (id, action, entity_type, entity_id, after_json)
          VALUES ('a1', 'create', 'payslip', 's1', '{"id":"s1"}');
      `);
      const projectBefore = sqlite.prepare('SELECT * FROM project').all();
      const auditBefore = db.select().from(auditLog).all();
      for (const statement of migrations[PAYROLL_MIGRATION]!.sql) sqlite.exec(statement);

      expect(sqlite.prepare('SELECT * FROM project').all()).toEqual(
        projectBefore.map((row) => ({ ...(row as object), archived_at: null })),
      );
      expect(db.select().from(auditLog).all()).toEqual(auditBefore);
      expect(
        sqlite.prepare('SELECT sv_cents, tax_cents, special_type, gross_cents FROM payslip').all(),
      ).toEqual([{ sv_cents: 0, tax_cents: 0, special_type: null, gross_cents: 10000 }]);
      expect(
        sqlite
          .prepare(
            'SELECT id, section, amount_cents, sort_order, deleted_at FROM payslip_line ORDER BY id',
          )
          .all(),
      ).toEqual([
        { id: 'l1', section: 'earning', amount_cents: 10000, sort_order: 0, deleted_at: null },
        { id: 'l2', section: 'deduction', amount_cents: 3000, sort_order: 1, deleted_at: null },
      ]);
      db.insert(payslipLine)
        .values({
          id: 'new-reimbursement',
          payslipId: 's1',
          section: 'reimbursement',
          label: 'Synthetische Reisekosten',
          amountCents: 200,
        })
        .run();
      expect(() =>
        db
          .insert(payslipLine)
          .values({
            id: 'invalid-section',
            payslipId: 's1',
            section: 'unknown' as never,
            label: 'Synthetische ungültige Zeile',
            amountCents: 200,
          })
          .run(),
      ).toThrow(/CHECK/);
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);
      expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
      // Later intake migrations must preserve existing signed-capable capture/audit rows.
      const retainedLines = db.select().from(payslipLine).all();
      const retainedAudit = db.select().from(auditLog).all();
      for (const migration of migrations.slice(PAYROLL_MIGRATION + 1))
        for (const statement of migration.sql) sqlite.exec(statement);
      expect(db.select().from(payslipLine).all()).toEqual(retainedLines);
      expect(db.select().from(auditLog).all()).toEqual(retainedAudit);
      db.insert(payslipLine)
        .values({
          id: 'signed-tax-correction',
          payslipId: 's1',
          section: 'tax_adjustment',
          label: 'Synthetische Steuer-Aufrollung',
          amountCents: -100,
        })
        .run();
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    } finally {
      close();
    }
  });
});
