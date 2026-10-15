import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq, isNull } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import type { ParsedPayrollDocument } from '@budget/domain';
import { account, booking, bookingSplit, inboxItem } from '../schema';
import { undo } from './audit';
import { createBooking } from './bookings';
import { decidePayslipIntake, getPayslipIntake, stagePayslip } from './payslip-intake';
import { listPayslips } from './payroll-projects';
import { listReceipts } from './receipts';
import { seedBasics, testCtx } from './test-helpers';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());

const parsed: ParsedPayrollDocument = {
  documentType: 'payslip',
  periodSource: 'content',
  payoutDate: '2026-09-30',
  differenceCents: 0,
  warnings: [],
  draft: {
    month: '2026-09',
    kind: 'regular',
    specialType: null,
    grossCents: 400000,
    svCents: 68000,
    taxCents: 44000,
    netCents: 297500,
    bookingId: null,
    receiptId: null,
    lines: [
      { section: 'deduction', label: 'Abzug Muster', amountCents: 500 },
      { section: 'reimbursement', label: 'Erstattung Muster', amountCents: 10000 },
    ],
  },
};
const stage = (document = parsed) =>
  stagePayslip(
    opened.db,
    {
      sha256: 'a'.repeat(64),
      source: 'manual',
      sizeBytes: 100,
      filename: 'synthetic-payout.pdf',
      parsed: document,
    },
    testCtx,
  ).id;
const liveBookings = () => opened.db.select().from(booking).where(isNull(booking.deletedAt)).all();

it('reuses an existing payout in the selected account and refuses an accidental second payout', () => {
  const id = stage();
  const existing = createBooking(
    opened.db,
    {
      accountId: 'spar',
      date: '2026-09-30',
      amountCents: 297500,
      splits: [{ categoryId: null, amountCents: 297500, incomeTypeId: 'income-salary' }],
    },
    testCtx,
  );
  expect(() =>
    decidePayslipIntake(
      opened.db,
      id,
      { action: 'confirm', bookingId: null, accountId: 'spar' },
      testCtx,
    ),
  ).toThrow(/bereits vorhanden/);
  expect(liveBookings()).toHaveLength(1);
  expect(listPayslips(opened.db)).toHaveLength(0);
  decidePayslipIntake(
    opened.db,
    id,
    { action: 'confirm', bookingId: existing, accountId: 'spar' },
    testCtx,
  );
  expect(liveBookings()).toHaveLength(1);
  expect(listPayslips(opened.db)[0]?.bookingId).toBe(existing);
});

it('creates the selected pending payout with exact salary/refund splits and one grouped undo/redo', () => {
  const id = stage();
  const saved = decidePayslipIntake(
    opened.db,
    id,
    {
      action: 'confirm',
      bookingId: null,
      accountId: 'spar',
    },
    testCtx,
  );
  expect(liveBookings()).toHaveLength(1);
  const payout = liveBookings()[0]!;
  expect(payout).toMatchObject({
    accountId: 'spar',
    date: '2026-09-30',
    amountCents: 297500,
    status: 'pending',
  });
  expect(
    opened.db.select().from(bookingSplit).where(eq(bookingSplit.bookingId, payout.id)).all(),
  ).toMatchObject([
    { amountCents: 287500, incomeTypeId: 'income-salary' },
    { amountCents: 10000, incomeTypeId: 'income-refund' },
  ]);
  expect(listPayslips(opened.db)[0]).toMatchObject({ id: saved.payslipId, bookingId: payout.id });
  expect(listReceipts(opened.db, payout.id)).toHaveLength(1);
  const undone = undo(opened.db, { groupId: saved.groupId }, testCtx);
  expect(liveBookings()).toHaveLength(0);
  expect(listPayslips(opened.db)).toHaveLength(0);
  expect(getPayslipIntake(opened.db, id).status).toBe('pending');
  undo(opened.db, { groupId: undone.groupId }, testCtx);
  expect(liveBookings()).toHaveLength(1);
  expect(listPayslips(opened.db)[0]?.bookingId).toBe(payout.id);
  expect(() =>
    decidePayslipIntake(
      opened.db,
      id,
      { action: 'confirm', bookingId: null, accountId: 'spar' },
      testCtx,
    ),
  ).toThrow();
  expect(liveBookings()).toHaveLength(1);
});

it.each(['missing', 'closed', 'currency', 'before-opening', 'warning', 'missing-inbox'])(
  'leaves no payout or payslip after a %s failure',
  (reason) => {
    const id = stage(
      reason === 'warning' ? { ...parsed, warnings: ['Unbekannte Lohnart Muster'] } : parsed,
    );
    if (reason === 'closed')
      opened.db.update(account).set({ closedAt: '2026-09-29' }).where(eq(account.id, 'spar')).run();
    if (reason === 'before-opening')
      opened.db
        .update(account)
        .set({ openingDate: '2026-10-01' })
        .where(eq(account.id, 'spar'))
        .run();
    if (reason === 'missing-inbox')
      opened.db.delete(inboxItem).where(eq(inboxItem.refId, id)).run();
    const accountId = reason === 'missing' ? 'missing' : reason === 'currency' ? 'usd' : 'spar';
    expect(() =>
      decidePayslipIntake(
        opened.db,
        id,
        { action: 'confirm', bookingId: null, accountId },
        testCtx,
      ),
    ).toThrow();
    expect(liveBookings()).toHaveLength(0);
    expect(listPayslips(opened.db)).toHaveLength(0);
    expect(getPayslipIntake(opened.db, id).status).toBe('pending');
  },
);
