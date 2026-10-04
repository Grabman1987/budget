import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  accounts,
  createBooking,
  createTestDatabase,
  decidePayslipIntake,
  getPayslipIntake,
  INCOME_TYPES,
  history,
  savePayslip,
  listPayslips,
  listReceipts,
  payslipMatches,
  readInbox,
  setPayslipSourceConfig,
  undo,
  type OpenedDatabase,
} from '@budget/db';
import { payrollTotals } from '@budget/domain';
import { PayslipIntakeService } from './service';
import { syntheticPayslipPdf, syntheticWageRows } from './testing';
import { receiptPath } from '../receipts/files';

let opened: OpenedDatabase, dir: string;
beforeEach(async () => {
  opened = createTestDatabase();
  dir = await mkdtemp(join(tmpdir(), 'budget-payslip-'));
  accounts.create(
    opened.db,
    {
      id: 'salary',
      name: 'Synthetisches Konto',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2025-01-01',
      openingBalanceCents: 0,
    },
    { actor: 'test' },
  );
  setPayslipSourceConfig(
    opened.db,
    { salaryAccountId: 'salary', wageTypes: {} },
    { actor: 'test' },
  );
});
afterEach(async () => {
  opened.close();
  await rm(dir, { recursive: true, force: true });
});
const service = (password: string | undefined = 'synthetic-pdf-password') =>
  new PayslipIntakeService(opened.db, dir, password);
// PDF generation and parsing in a worker thread is slow on loaded CI runners (Windows).
describe('encrypted synthetic payroll PDFs and owner intake', { timeout: 30_000 }, () => {
  it('conserves signed corrections, separates reimbursements and takes content period before filename', async () => {
    const bytes = await syntheticPayslipPdf();
    const staged = await service().ingest(bytes, 'synthetic-202701.pdf', 'manual');
    const row = getPayslipIntake(opened.db, staged.id);
    expect(row.parsed).toMatchObject({
      documentType: 'payslip',
      periodSource: 'content',
      differenceCents: 0,
      warnings: [],
    });
    expect(row.parsed.draft).toMatchObject({
      month: '2026-09',
      grossCents: 400000,
      svCents: 70000,
      taxCents: 50000,
      netCents: 297500,
    });
    expect(payrollTotals([row.parsed.draft!])).toMatchObject({
      svCents: 68000,
      taxCents: 44000,
      taxRefundCents: 6000,
      salaryNetCents: 287500,
      reimbursementsCents: 10000,
      calculatedNetCents: 297500,
    });
    expect(row.parsed.draft!.lines).toContainEqual({
      section: 'tax_adjustment',
      label: 'Aufrollung Lohnsteuer-Erstattung',
      amountCents: -6000,
    });
    expect(await readFile(receiptPath(dir, row.sha256))).toEqual(bytes);
    expect(listPayslips(opened.db)).toEqual([]);
    expect(listReceipts(opened.db)).toEqual([]);
    expect(readInbox(opened.db, '2026-10-03').count).toBe(1);
    expect(await service().ingest(bytes, 'renamed.pdf', 'dropbox')).toMatchObject({
      duplicate: true,
      id: row.id,
    });
  });
  it.each(['', 'wrong-synthetic-password'])(
    'retains a warning for missing/wrong password (%s) and supports retry',
    async (password) => {
      const staged = await service(password).ingest(
        await syntheticPayslipPdf(),
        'synthetic-202609.pdf',
        'manual',
      );
      expect(getPayslipIntake(opened.db, staged.id).parsed.warnings[0]).toMatch(/PDF-Passwort/);
      expect(() =>
        decidePayslipIntake(
          opened.db,
          staged.id,
          { action: 'confirm', bookingId: null },
          { actor: 'test' },
        ),
      ).toThrow();
      await service().retry(staged.id);
      expect(getPayslipIntake(opened.db, staged.id).parsed.warnings).toEqual([]);
    },
  );
  it('confirms atomically, links receipt, never creates a booking, and restores draft on grouped undo/redo', async () => {
    const salary = createBooking(
      opened.db,
      {
        accountId: 'salary',
        date: '2026-09-30',
        amountCents: 297500,
        currency: 'EUR',
        splits: [
          {
            categoryId: null,
            contactId: null,
            amountCents: 287500,
            incomeTypeId: INCOME_TYPES.salary.id,
          },
          {
            categoryId: null,
            contactId: null,
            amountCents: 10000,
            incomeTypeId: INCOME_TYPES.refund.id,
          },
        ],
      },
      { actor: 'test' },
    );
    const staged = await service().ingest(await syntheticPayslipPdf(), 'synthetic.pdf', 'manual');
    const parsed = getPayslipIntake(opened.db, staged.id).parsed;
    expect(payslipMatches(opened.db, parsed)).toEqual([
      { id: salary, date: '2026-09-30', amountCents: 297500, differenceCents: 0, exact: true },
    ]);
    const saved = decidePayslipIntake(
      opened.db,
      staged.id,
      { action: 'confirm', bookingId: salary },
      { actor: 'test' },
    );
    expect(listPayslips(opened.db)[0]).toMatchObject({ id: saved.payslipId, bookingId: salary });
    expect(listReceipts(opened.db, salary)).toHaveLength(1);
    const undone = undo(opened.db, { groupId: saved.groupId }, { actor: 'test' });
    expect(getPayslipIntake(opened.db, staged.id).status).toBe('pending');
    expect(listPayslips(opened.db)).toHaveLength(0);
    undo(opened.db, { groupId: undone.groupId }, { actor: 'test' });
    expect(listPayslips(opened.db)).toHaveLength(1);
    expect(() =>
      decidePayslipIntake(
        opened.db,
        staged.id,
        { action: 'confirm', bookingId: salary },
        { actor: 'test' },
      ),
    ).toThrow();
  });
  it('rejects without saving and deduplicates rejected bytes', async () => {
    const bytes = await syntheticPayslipPdf();
    const staged = await service().ingest(bytes, 'synthetic.pdf', 'manual');
    const rejected = decidePayslipIntake(
      opened.db,
      staged.id,
      { action: 'reject', bookingId: null },
      { actor: 'test' },
    );
    expect(listPayslips(opened.db)).toHaveLength(0);
    expect(readInbox(opened.db, '2026-10-03').count).toBe(0);
    expect(await service().ingest(bytes, 'synthetic.pdf', 'manual')).toMatchObject({
      duplicate: true,
    });
    undo(opened.db, { groupId: rejected.groupId }, { actor: 'test' });
    expect(readInbox(opened.db, '2026-10-03').count).toBe(1);
  });
  it('reopens an undone intake without creating a second identity', async () => {
    const bytes = await syntheticPayslipPdf();
    const staged = await service().ingest(bytes, 'synthetic.pdf', 'manual');
    undo(opened.db, { groupId: staged.groupId! }, { actor: 'test' });
    const restored = await service().ingest(bytes, 'synthetic.pdf', 'manual');
    expect(restored).toMatchObject({ id: staged.id, duplicate: false });
    expect(readInbox(opened.db, '2026-10-03').count).toBe(1);
  });
  it('restricts matching to the salary account and five calendar days, showing cent differences', async () => {
    const staged = await service().ingest(await syntheticPayslipPdf(), 'synthetic.pdf', 'manual');
    accounts.create(
      opened.db,
      {
        id: 'other',
        name: 'Anderes synthetisches Konto',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2025-01-01',
        openingBalanceCents: 0,
      },
      { actor: 'test' },
    );
    const b = (accountId: string, date: string, amountCents: number) =>
      createBooking(
        opened.db,
        {
          accountId,
          date,
          amountCents,
          splits: [{ amountCents, incomeTypeId: INCOME_TYPES.salary.id }],
        },
        { actor: 'test' },
      );
    const near = b('salary', '2026-10-05', 297501);
    b('salary', '2026-10-06', 297500);
    b('other', '2026-09-30', 297500);
    expect(payslipMatches(opened.db, getPayslipIntake(opened.db, staged.id).parsed)).toEqual([
      { id: near, date: '2026-10-05', amountCents: 297501, differenceCents: 1, exact: false },
    ]);
  });
  it('refuses partial/forced decision undo and rolls back a duplicate-month confirmation', async () => {
    const staged = await service().ingest(await syntheticPayslipPdf(), 'synthetic.pdf', 'manual');
    const saved = decidePayslipIntake(
      opened.db,
      staged.id,
      { action: 'confirm', bookingId: null },
      { actor: 'test' },
    );
    const entry = history(opened.db, 'payslip', saved.payslipId!)[0]!;
    expect(() =>
      undo(opened.db, { auditId: entry.id }, { actor: 'test' }, { force: true }),
    ).toThrow('gesamte Aktion');
    expect(() =>
      undo(opened.db, { groupId: staged.groupId! }, { actor: 'test' }, { force: true }),
    ).toThrow('referenced');
    undo(opened.db, { groupId: saved.groupId }, { actor: 'test' });
    const draft = getPayslipIntake(opened.db, staged.id).parsed.draft!;
    savePayslip(opened.db, { ...draft, receiptId: null }, { actor: 'test' });
    expect(() =>
      decidePayslipIntake(
        opened.db,
        staged.id,
        { action: 'confirm', bookingId: null },
        { actor: 'test' },
      ),
    ).toThrow('bereits');
    expect(getPayslipIntake(opened.db, staged.id).status).toBe('pending');
    expect(listPayslips(opened.db)).toHaveLength(1);
    expect(
      readInbox(opened.db, '2026-10-03').entries.filter(
        (i) => i.type === 'stored' && i.refType === 'payslip-intake',
      ),
    ).toHaveLength(1);
  });
  it.each([1, 2])(
    'checks a %i-cent difference without silently accepting a larger discrepancy',
    async (delta) => {
      const rows = syntheticWageRows.map((r) =>
        r.startsWith('Auszahlung ') ? `Auszahlung 2.975,0${delta}` : r,
      );
      const staged = await service().ingest(
        await syntheticPayslipPdf(rows),
        'synthetic.pdf',
        'manual',
      );
      expect(getPayslipIntake(opened.db, staged.id).parsed.differenceCents).toBe(-delta);
      if (delta === 1) {
        decidePayslipIntake(
          opened.db,
          staged.id,
          { action: 'confirm', bookingId: null },
          { actor: 'test' },
        );
        expect(listPayslips(opened.db)[0]!.lines).toContainEqual(
          expect.objectContaining({ label: 'Rundung (Summenprüfung)', amountCents: -1 }),
        );
        expect(payrollTotals(listPayslips(opened.db)).calculatedNetCents).toBe(297501);
      } else {
        expect(() =>
          decidePayslipIntake(
            opened.db,
            staged.id,
            { action: 'confirm', bookingId: null },
            { actor: 'test' },
          ),
        ).toThrow();
        expect(listPayslips(opened.db)).toHaveLength(0);
        expect(getPayslipIntake(opened.db, staged.id).status).toBe('pending');
      }
    },
  );
  it('discloses filename fallback and keeps malformed PDFs in the inbox', async () => {
    const rows = syntheticWageRows.filter((r) => !r.startsWith('Abrechnungsmonat'));
    const staged = await service().ingest(
      await syntheticPayslipPdf(rows),
      'synthetic-202609.pdf',
      'manual',
    );
    expect(getPayslipIntake(opened.db, staged.id).parsed).toMatchObject({
      periodSource: 'filename',
      draft: { month: '2026-09' },
      warnings: ['Abrechnungsmonat nur aus dem Dateinamen erkannt.'],
    });
    const malformed = await service().ingest(
      (await syntheticPayslipPdf()).subarray(0, 9),
      'synthetic.pdf',
      'manual',
    );
    expect(getPayslipIntake(opened.db, malformed.id).parsed.draft).toBeNull();
    expect(getPayslipIntake(opened.db, malformed.id).parsed.warnings).toHaveLength(1);
  });
  it('uses owner wage mapping, preserves unknown lines as warning and prevents bad sum confirmation', async () => {
    const rows = syntheticWageRows.map((r) =>
      r.startsWith('811 ') ? '899 Synthetische Auslage 25,00' : r,
    );
    const staged = await service().ingest(
      await syntheticPayslipPdf(rows),
      'synthetic.pdf',
      'manual',
    );
    expect(getPayslipIntake(opened.db, staged.id).parsed.warnings).toContain(
      'Unbekannte Lohnart oder Aufrollung: Zuordnung prüfen.',
    );
    setPayslipSourceConfig(
      opened.db,
      { salaryAccountId: 'salary', wageTypes: { '899': 'reimbursement' } },
      { actor: 'test' },
    );
    await service().retry(staged.id);
    expect(getPayslipIntake(opened.db, staged.id).parsed.warnings).toEqual([]);
  });
  it.each([
    ['Mitarbeiterbonus', 'bonus'],
    ['Pensionskasse Mitteilung', 'pension'],
  ] as const)('recognizes separate %s document type', async (heading, documentType) => {
    const rows =
      documentType === 'pension'
        ? [heading, 'Abrechnungsmonat: 09/2026']
        : [heading, ...syntheticWageRows];
    const staged = await service().ingest(
      await syntheticPayslipPdf(rows),
      'synthetic.pdf',
      'manual',
    );
    expect(getPayslipIntake(opened.db, staged.id).parsed.documentType).toBe(documentType);
    if (documentType === 'pension')
      expect(getPayslipIntake(opened.db, staged.id).parsed.draft).toBeNull();
  });
});
