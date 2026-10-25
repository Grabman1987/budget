import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq, isNull } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import type { ParsedPayrollDocument } from '@budget/domain';
import { account, booking, bookingSplit, inboxItem, expectedOccurrence, payee } from '../schema';
import { undo } from './audit';
import { createBooking } from './bookings';
import { accounts } from './entities';
import {
  decidePayslipIntake,
  getPayslipIntake,
  getPayslipSourceConfig,
  replaceParsedPayslip,
  replacePayslipMappings,
  stagePayslip,
} from './payslip-intake';
import { listPayslips } from './payroll-projects';
import { listReceipts } from './receipts';
import { createExpectedPayment } from './expected';
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

it('rejects an internal correction payee without saving any payout or payslip', () => {
  const id = stage();
  const system = opened.db
    .select()
    .from(payee)
    .all()
    .find((partner) => partner.systemKind);
  expect(system).toBeDefined();
  expect(() =>
    decidePayslipIntake(
      opened.db,
      id,
      {
        action: 'confirm',
        bookingId: null,
        accountId: 'spar',
        payeeId: system!.id,
      },
      testCtx,
    ),
  ).toThrow(/nicht mehr verfügbar/);
  expect(liveBookings()).toHaveLength(0);
  expect(listPayslips(opened.db)).toHaveLength(0);
  expect(getPayslipIntake(opened.db, id).status).toBe('pending');
});

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

it('uses and settles a unique salary expectation date/payee, and undo reopens it atomically', () => {
  const expectation = createExpectedPayment(
    opened.db,
    {
      name: 'Gehalt Muster',
      kind: 'inflow',
      accountId: 'spar',
      payeeId: 'p1',
      incomeTypeId: 'income-salary',
      dueDay: 15,
      startDate: '2026-01-01',
    },
    { validFrom: '2026-01-01', amountCents: 297_500 },
    testCtx,
    '2026-09-01',
  ).payment;
  const occurrence = opened.db
    .select()
    .from(expectedOccurrence)
    .all()
    .find((o) => o.expectedPaymentId === expectation.id && o.dueDate === '2026-09-15')!;
  const id = stage({ ...parsed, payoutDate: null });
  const saved = decidePayslipIntake(
    opened.db,
    id,
    {
      action: 'confirm',
      bookingId: null,
      accountId: 'spar',
      expectedOccurrenceId: occurrence.id,
    },
    testCtx,
  );
  const payout = liveBookings()[0]!;
  expect(payout).toMatchObject({ date: '2026-09-15', payeeId: 'p1' });
  expect(
    opened.db
      .select()
      .from(expectedOccurrence)
      .all()
      .find((o) => o.id === occurrence.id),
  ).toMatchObject({ status: 'received', bookingId: payout.id });
  undo(opened.db, { groupId: saved.groupId }, testCtx);
  expect(liveBookings()).toHaveLength(0);
  expect(
    opened.db
      .select()
      .from(expectedOccurrence)
      .all()
      .find((o) => o.id === occurrence.id),
  ).toMatchObject({ status: 'expected', bookingId: null });
});

it('requires an explicit payout day when neither the PDF nor an expectation supplies one', () => {
  const id = stage({ ...parsed, payoutDate: null });
  expect(() =>
    decidePayslipIntake(
      opened.db,
      id,
      {
        action: 'confirm',
        bookingId: null,
        accountId: 'spar',
      },
      testCtx,
    ),
  ).toThrow(/Auszahlungsdatum wählen/);
  expect(liveBookings()).toHaveLength(0);
});

it('does not overwrite a reparse that won the race against an owner mapping', () => {
  const id = stage({
    ...parsed,
    unmappedWageTypes: [{ code: '777', label: 'Muster', amountCents: 100 }],
  });
  const oldConfig = getPayslipSourceConfig(opened.db);
  const oldParsed = getPayslipIntake(opened.db, id).parsed;
  const newer = { ...oldParsed, warnings: ['Neu ausgewertet'] };
  replaceParsedPayslip(opened.db, id, newer, testCtx);
  const nextConfig = {
    ...oldConfig,
    wageTypes: { ...oldConfig.wageTypes, '777': 'deduction' as const },
  };
  expect(() =>
    replacePayslipMappings(opened.db, id, oldConfig, oldParsed, nextConfig, oldParsed, testCtx),
  ).toThrow(/zwischenzeitlich/);
  expect(getPayslipSourceConfig(opened.db)).toEqual(oldConfig);
  expect(getPayslipIntake(opened.db, id).parsed).toEqual(newer);
});

it('rechecks payout matching against an edited day and never changes a matched booking', () => {
  const id = stage();
  const existing = createBooking(
    opened.db,
    {
      accountId: 'spar',
      date: '2026-09-15',
      amountCents: 297_500,
      splits: [{ categoryId: null, amountCents: 297_500, incomeTypeId: 'income-salary' }],
    },
    testCtx,
  );
  expect(() =>
    decidePayslipIntake(
      opened.db,
      id,
      {
        action: 'confirm',
        bookingId: null,
        accountId: 'spar',
        payoutDate: '2026-09-15',
      },
      testCtx,
    ),
  ).toThrow(/bereits vorhanden/);
  decidePayslipIntake(
    opened.db,
    id,
    {
      action: 'confirm',
      bookingId: existing,
      accountId: 'spar',
      payoutDate: '2026-09-15',
    },
    testCtx,
  );
  expect(liveBookings()).toMatchObject([{ id: existing, date: '2026-09-15', payeeId: null }]);
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

it.each([-1, 0, 1])(
  'confirms a cash special payout and preserves a %i-cent rounding difference',
  (difference) => {
    accounts.create(
      opened.db,
      {
        id: 'cash',
        name: 'Bargeld Muster',
        type: 'cash',
        role: 'budget',
        onBudget: true,
        openingDate: '2025-01-01',
      },
      testCtx,
    );
    const id = stage({
      ...parsed,
      differenceCents: difference,
      draft: {
        ...parsed.draft!,
        kind: 'special',
        specialType: 'other',
        netCents: 297500 - difference,
      },
    });
    const saved = decidePayslipIntake(
      opened.db,
      id,
      {
        action: 'confirm',
        bookingId: null,
        accountId: 'cash',
      },
      testCtx,
    );
    const payout = liveBookings()[0]!;
    expect(payout).toMatchObject({
      accountId: 'cash',
      status: 'confirmed',
      amountCents: 297500 - difference,
    });
    expect(
      opened.db.select().from(bookingSplit).where(eq(bookingSplit.bookingId, payout.id)).all(),
    ).toMatchObject([
      { amountCents: 287500 - difference, incomeTypeId: 'income-special' },
      { amountCents: 10000, incomeTypeId: 'income-refund' },
    ]);
    expect(listPayslips(opened.db)[0]).toMatchObject({
      kind: 'special',
      netCents: 297500 - difference,
    });
    undo(opened.db, { groupId: saved.groupId }, testCtx);
    expect(liveBookings()).toHaveLength(0);
    expect(listPayslips(opened.db)).toHaveLength(0);
    expect(getPayslipIntake(opened.db, id).status).toBe('pending');
  },
);
