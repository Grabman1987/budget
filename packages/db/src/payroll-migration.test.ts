import { readMigrationFiles } from 'drizzle-orm/migrator';
import { describe, expect, it } from 'vitest';
import { defaultMigrationsFolder, openDatabase } from './client';
import { savePayslip } from './repos/payroll-projects';
import { auditLog, payslipLine } from './schema';

describe('payroll reimbursement migration', () => {
  it('retains captured lines, soft deletions and audit history while extending the section check', () => {
    const { db, sqlite, close } = openDatabase(':memory:');
    try {
      const migrations = readMigrationFiles({ migrationsFolder: defaultMigrationsFolder() });
      for (const migration of migrations.slice(0, 20))
        for (const statement of migration.sql) sqlite.exec(statement);
      const header = {
        month: '2026-09',
        kind: 'regular' as const,
        specialType: null,
        grossCents: 10000,
        svCents: 0,
        taxCents: 0,
        netCents: 10500,
        bookingId: null,
        receiptId: null,
        lines: [{ section: 'earning' as const, label: 'Synthetischer Bezug', amountCents: 500 }],
      };
      const captured = savePayslip(db, header, { actor: 'tester' });
      db.insert(payslipLine)
        .values({
          id: 'retained-line',
          payslipId: captured.id,
          section: 'deduction',
          label: 'Synthetischer alter Abzug',
          amountCents: 100,
          sortOrder: 1,
          deletedAt: '2026-10-01T00:00:00.000Z',
        })
        .run();
      const before = db.select().from(payslipLine).all();
      const audits = db.select().from(auditLog).all();
      for (const statement of migrations[20]!.sql) sqlite.exec(statement);
      expect(db.select().from(payslipLine).all()).toEqual(before);
      expect(db.select().from(auditLog).all()).toEqual(audits);
      db.insert(payslipLine)
        .values({
          id: 'new-reimbursement',
          payslipId: captured.id,
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
            payslipId: captured.id,
            section: 'unknown' as never,
            label: 'Synthetische ungültige Zeile',
            amountCents: 200,
          })
          .run(),
      ).toThrow(/CHECK/);
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);
      expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    } finally {
      close();
    }
  });
});
