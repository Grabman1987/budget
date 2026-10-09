import { addMonths } from '@budget/domain';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import {
  auditLog,
  booking,
  expectedOccurrence,
  expectedPaymentVersion,
  incomeType,
} from '../schema';
import { undo } from './audit';
import {
  createBooking,
  createTransfer,
  deleteBooking,
  getBooking,
  updateBooking,
} from './bookings';
import { AuditError, ConflictError, EntityNotFoundError } from './errors';
import {
  addExpectedVersion,
  createExpectedPayment,
  deleteExpectedPayment,
  linkOccurrence,
  listExpectedPayments,
  listExpectedVersions,
  markOccurrenceMissed,
  matchOccurrences,
  monthIncome,
  refreshOccurrences,
  restoreExpectedPayment,
  skipOccurrence,
  unlinkOccurrence,
  unskipOccurrence,
  updateExpectedPayment,
  upcoming,
  versionSuggestions,
} from './expected';
import { forecastInputs, loadFacts, scheduled } from './rule-inputs';
import { seedBasics, testCtx as ctx } from './test-helpers';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];
const TODAY = '2026-03-20';

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
});
afterEach(() => opened.close());

/** Rent: 1st of the month, 400,00 €, 3 days window, no tolerance. */
const rent = (over: Partial<Parameters<typeof createExpectedPayment>[1]> = {}) =>
  createExpectedPayment(
    db,
    {
      name: 'Miete',
      accountId: 'giro',
      payeeId: 'p1',
      categoryId: 'miete',
      dueDay: 1,
      startDate: '2026-01-01',
      ...over,
    },
    { validFrom: '2026-01-01', amountCents: 40_000 },
    ctx,
    TODAY,
  ).payment;

const book = (date: string, amountCents: number, categoryId: string | null = 'miete') =>
  createBooking(
    db,
    {
      accountId: 'giro',
      date,
      amountCents,
      payeeId: 'p1',
      splits: [{ categoryId, amountCents }],
    },
    ctx,
  );

const occurrencesOf = (paymentId: string) =>
  db
    .select()
    .from(expectedOccurrence)
    .where(eq(expectedOccurrence.expectedPaymentId, paymentId))
    .all()
    .filter((o) => o.deletedAt === null)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

describe('materialising occurrences', () => {
  it('plans from last month to twelve months ahead, signed, and is idempotent', () => {
    const p = rent();
    const rows = occurrencesOf(p.id);
    expect(rows.map((r) => r.dueDate)).toEqual(
      Array.from({ length: 14 }, (_, i) => `${addMonths('2026-02', i)}-01`),
    );
    expect(rows[0]?.expectedAmountCents).toBe(-40_000);
    const again = refreshOccurrences(db, TODAY);
    expect(again).toEqual({ created: 0, updated: 0, removed: 0 });
    expect(occurrencesOf(p.id)).toHaveLength(rows.length);
  });

  it('a new day only adds what has come into the window', () => {
    const p = rent();
    const n = occurrencesOf(p.id).length;
    const r = refreshOccurrences(db, '2026-04-02');
    expect(r.created).toBe(1);
    expect(occurrencesOf(p.id)).toHaveLength(n + 1);
  });

  it('share and range come from the payment and the version', () => {
    const p = createExpectedPayment(
      db,
      { name: 'Abo', accountId: 'giro', contactId: null, payeeId: 'p1', dueDay: 5 },
      { validFrom: '2026-01-01', amountCents: 1_001 },
      ctx,
      TODAY,
    ).payment;
    expect(occurrencesOf(p.id)[0]?.contactShareCents).toBe(0);
  });
});

describe('versions', () => {
  it('re-plans future open occurrences only, in one undoable group', () => {
    const p = rent();
    const { groupId } = addExpectedVersion(
      db,
      p.id,
      { validFrom: '2026-05-01', amountCents: 45_000 },
      ctx,
      TODAY,
    );
    const amounts = Object.fromEntries(
      occurrencesOf(p.id).map((o) => [o.dueDate, o.expectedAmountCents]),
    );
    expect(amounts['2026-04-01']).toBe(-40_000);
    expect(amounts['2026-05-01']).toBe(-45_000);
    expect(amounts['2027-03-01']).toBe(-45_000);
    expect(refreshOccurrences(db, TODAY).updated).toBe(0);

    undo(db, { groupId }, ctx);
    expect(listExpectedVersions(db, p.id)).toHaveLength(1);
    expect(occurrencesOf(p.id).every((o) => o.expectedAmountCents === -40_000)).toBe(true);
  });

  it('never edits an old version: same day is refused, the trigger guards the table', () => {
    const p = rent();
    expect(() =>
      addExpectedVersion(db, p.id, { validFrom: '2026-01-01', amountCents: 1 }, ctx, TODAY),
    ).toThrow(ConflictError);
    expect(() =>
      db
        .update(expectedPaymentVersion)
        .set({ amountCents: 1 })
        .where(eq(expectedPaymentVersion.expectedPaymentId, p.id))
        .run(),
    ).toThrow(/immutable/);
  });

  it('keeps matched and past occurrences when the price changes', () => {
    const p = rent();
    book('2026-03-01', -40_000);
    matchOccurrences(db, TODAY);
    addExpectedVersion(db, p.id, { validFrom: '2026-03-01', amountCents: 50_000 }, ctx, TODAY);
    const march = occurrencesOf(p.id).find((o) => o.dueDate === '2026-03-01')!;
    expect(march.status).toBe('received');
    expect(march.expectedAmountCents).toBe(-40_000);
    expect(occurrencesOf(p.id).find((o) => o.dueDate === '2026-04-01')?.expectedAmountCents).toBe(
      -50_000,
    );
  });
});

describe('payments', () => {
  it('update re-plans, delete removes open future rows, restore brings them back', () => {
    const p = rent();
    updateExpectedPayment(db, p.id, { dueDay: 15 }, ctx, TODAY);
    const days = occurrencesOf(p.id).map((o) => o.dueDate);
    expect(days).toContain('2026-04-15');
    expect(days).not.toContain('2026-04-01');
    // past rows stay as they were
    expect(days).toContain('2026-02-01');

    deleteExpectedPayment(db, p.id, ctx, TODAY);
    expect(occurrencesOf(p.id).every((o) => o.dueDate < TODAY)).toBe(true);
    expect(upcoming(db, '2026-01-01', '2027-12-31')).toEqual([]);
    expect(listExpectedPayments(db, TODAY)).toEqual([]);
    expect(listExpectedPayments(db, TODAY, { includeDeleted: true })).toHaveLength(1);

    restoreExpectedPayment(db, p.id, ctx, TODAY);
    expect(occurrencesOf(p.id).map((o) => o.dueDate)).toContain('2026-04-15');
  });

  it('undo of a delete group restores the plan', () => {
    const p = rent();
    const { groupId } = deleteExpectedPayment(db, p.id, ctx, TODAY);
    undo(db, { groupId }, ctx);
    expect(upcoming(db, '2026-04-01', '2026-04-30')).toHaveLength(1);
  });

  it('lists the current version, next due date and equivalents', () => {
    rent();
    createExpectedPayment(
      db,
      {
        name: 'Versicherung',
        accountId: 'giro',
        payeeId: 'p1',
        rhythm: 'yearly',
        dueMonth: 6,
        dueDay: 12,
      },
      { validFrom: '2026-01-01', amountCents: 48_600 },
      ctx,
      TODAY,
    );
    const list = listExpectedPayments(db, TODAY);
    const ins = list.find((p) => p.name === 'Versicherung')!;
    expect(ins.nextDueDate).toBe('2026-06-12');
    expect(ins.amountCents).toBe(-48_600);
    expect(ins.monthlyEquivalentCents).toBe(-4_050);
    expect(ins.yearlyEquivalentCents).toBe(-48_600);
    expect(list.find((p) => p.name === 'Miete')?.nextDueDate).toBe('2026-04-01');
    expect(() => updateExpectedPayment(db, 'nope', { note: 'x' }, ctx, TODAY)).toThrow(
      EntityNotFoundError,
    );
  });
});

describe('matching', () => {
  it('received inside the tolerance, deviating outside, with a version suggestion', () => {
    const p = rent({ amountToleranceCents: 100 });
    book('2026-03-02', -40_050);
    book('2026-02-01', -42_000);
    const summary = matchOccurrences(db, TODAY);
    expect(summary).toMatchObject({ received: 1, deviating: 1 });
    const rows = upcoming(db, '2026-02-01', '2026-03-31');
    expect(rows.map((r) => r.status)).toEqual(['deviating', 'received']);
    expect(rows[0]?.suggestion).toEqual({
      paymentId: p.id,
      fromMonth: '2026-02',
      amountCents: 42_000,
    });
    expect(rows[1]?.suggestion).toBeNull();
    expect(versionSuggestions(db, '2026-02-01', '2026-03-31')).toHaveLength(1);
  });

  it('is idempotent and a booking belongs to at most one occurrence', () => {
    rent({ dateWindowDays: 31 });
    book('2026-03-01', -40_000);
    matchOccurrences(db, TODAY);
    expect(matchOccurrences(db, TODAY)).toEqual({ received: 0, deviating: 0, missed: 0 });
    const linked = occurrencesOf(
      db.select().from(expectedOccurrence).get()!.expectedPaymentId,
    ).filter((o) => o.bookingId !== null);
    expect(linked).toHaveLength(1);
    expect(linked[0]?.dueDate).toBe('2026-03-01');
  });

  it('marks occurrences missed once the window has passed without a booking', () => {
    rent();
    matchOccurrences(db, TODAY);
    const rows = upcoming(db, '2026-02-01', '2026-04-30');
    expect(rows.map((r) => [r.dueDate, r.status])).toEqual([
      ['2026-02-01', 'missed'],
      ['2026-03-01', 'missed'],
      ['2026-04-01', 'expected'],
    ]);
  });

  it('ignores bookings of other accounts, other signs and other payments', () => {
    rent();
    createBooking(
      db,
      {
        accountId: 'spar',
        date: '2026-03-01',
        amountCents: -40_000,
        payeeId: 'p1',
        splits: [{ categoryId: 'miete', amountCents: -40_000 }],
      },
      ctx,
    );
    book('2026-03-01', 40_000, null);
    matchOccurrences(db, TODAY);
    expect(upcoming(db, '2026-03-01', '2026-03-01')[0]?.status).toBe('missed');
  });

  it('two payments of one payee each get their own booking', () => {
    const a = rent({ name: 'Miete A', dueDay: 10, categoryId: 'miete' });
    createExpectedPayment(
      db,
      { name: 'Essen-Abo', accountId: 'giro', payeeId: 'p1', categoryId: 'essen', dueDay: 10 },
      { validFrom: '2026-01-01', amountCents: 2_800 },
      ctx,
      TODAY,
    );
    book('2026-03-10', -2_800, 'essen');
    book('2026-03-10', -40_000, 'miete');
    matchOccurrences(db, TODAY);
    const march = upcoming(db, '2026-03-10', '2026-03-10');
    expect(march.map((r) => [r.name, r.status])).toEqual([
      ['Essen-Abo', 'received'],
      ['Miete A', 'received'],
    ]);
    expect(a.id).toBeTruthy();
  });

  it('compares a card booking in another currency by its original amount', () => {
    createExpectedPayment(
      db,
      { name: 'Tool', accountId: 'giro', payeeId: 'p1', dueDay: 8 },
      { validFrom: '2026-01-01', amountCents: 1_000, currency: 'USD' },
      ctx,
      TODAY,
    );
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-08',
        amountCents: -935,
        payeeId: 'p1',
        splits: [{ categoryId: 'essen', amountCents: -935 }],
        originalAmountCents: -1_000,
        originalCurrency: 'USD',
        fxRateMicro: 935_000,
        fxFeeCents: 0,
      },
      ctx,
    );
    matchOccurrences(db, TODAY);
    const row = upcoming(db, '2026-03-08', '2026-03-08')[0]!;
    expect(row.status).toBe('received');
    expect(row.currency).toBe('USD');
    expect(row.amountCents).toBe(-1_000);
  });
});

describe('link, unlink, missed', () => {
  it('links by hand, refuses a second claim, unlinks into missed and is not re-matched', () => {
    const p = rent();
    const id = book('2026-03-01', -40_000);
    const other = book('2026-03-01', -39_000);
    const [march, april] = ['2026-03-01', '2026-04-01'].map((d) =>
      occurrencesOf(p.id).find((o) => o.dueDate === d)!,
    );
    const linked = linkOccurrence(db, march!.id, id, ctx);
    expect(linked.occurrence).toMatchObject({ status: 'received', bookingId: id });
    expect(() => linkOccurrence(db, april!.id, id, ctx)).toThrow(ConflictError);
    expect(linkOccurrence(db, march!.id, other, ctx).occurrence.status).toBe('deviating');

    const unlinked = unlinkOccurrence(db, march!.id, ctx);
    expect(unlinked.occurrence).toMatchObject({ status: 'missed', bookingId: null });
    matchOccurrences(db, TODAY);
    expect(occurrencesOf(p.id).find((o) => o.id === march!.id)?.status).toBe('missed');
    expect(() => unlinkOccurrence(db, march!.id, ctx)).toThrow(ConflictError);
  });

  it('marks ausgefallen, refuses a linked one, and undo reverts it', () => {
    const p = rent();
    const april = occurrencesOf(p.id).find((o) => o.dueDate === '2026-04-01')!;
    const { groupId } = markOccurrenceMissed(db, april.id, ctx);
    expect(upcoming(db, '2026-04-01', '2026-04-01')[0]?.status).toBe('missed');
    undo(db, { groupId }, ctx);
    expect(upcoming(db, '2026-04-01', '2026-04-01')[0]?.status).toBe('expected');

    const id = book('2026-03-01', -40_000);
    const march = occurrencesOf(p.id).find((o) => o.dueDate === '2026-03-01')!;
    const link = linkOccurrence(db, march.id, id, ctx);
    expect(() => markOccurrenceMissed(db, march.id, ctx)).toThrow(ConflictError);
    undo(db, { groupId: link.groupId }, ctx);
    expect(occurrencesOf(p.id).find((o) => o.id === march.id)).toMatchObject({
      status: 'expected',
      bookingId: null,
    });
  });
});

describe('monthIncome', () => {
  it('sets received against expected per income type and per payment', () => {
    const type = db.select().from(incomeType).all()[0]!;
    createExpectedPayment(
      db,
      {
        name: 'Gehalt',
        kind: 'inflow',
        accountId: 'giro',
        payeeId: 'p1',
        incomeTypeId: type.id,
        dueDay: 31,
        dateShift: 'before',
      },
      { validFrom: '2026-01-01', amountCents: 300_000 },
      ctx,
      TODAY,
    );
    createExpectedPayment(
      db,
      { name: 'Beitrag', kind: 'inflow', accountId: 'giro', payeeId: 'p1', dueDay: 1 },
      { validFrom: '2026-01-01', amountCents: 50_000 },
      ctx,
      TODAY,
    );
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-31',
        amountCents: 300_000,
        payeeId: 'p1',
        splits: [{ categoryId: null, amountCents: 300_000, incomeTypeId: type.id }],
      },
      ctx,
    );
    matchOccurrences(db, '2026-03-31');
    const income = monthIncome(db, '2026-03');
    expect(income.expectedCents).toBe(350_000);
    expect(income.receivedCents).toBe(300_000);
    expect(income.byPayment.map((l) => [l.name, l.dueDate, l.status])).toEqual([
      ['Beitrag', '2026-03-01', 'missed'],
      ['Gehalt', '2026-03-31', 'received'],
    ]);
    expect(income.byIncomeType).toEqual([
      { incomeTypeId: type.id, name: type.name, expectedCents: 300_000, receivedCents: 300_000 },
      { incomeTypeId: null, name: null, expectedCents: 50_000, receivedCents: 0 },
    ]);
  });
});

describe('booking lifecycle for expected payments', () => {
  const salary = () =>
    createExpectedPayment(
      db,
      {
        name: 'Expected salary',
        kind: 'inflow',
        accountId: 'giro',
        payeeId: 'p1',
        dueDay: 1,
        startDate: '2026-01-01',
        dateWindowDays: 3,
        amountToleranceCents: 0,
      },
      { validFrom: '2026-01-01', amountCents: 40_000 },
      ctx,
      TODAY,
    ).payment;

  const salaryBooking = (amountCents: number, date = '2026-03-01') =>
    createBooking(
      db,
      {
        accountId: 'giro',
        date,
        amountCents,
        payeeId: 'p1',
        splits: [{ amountCents }],
      },
      ctx,
    );

  const marchIncome = () => monthIncome(db, '2026-03');

  it('recomputes linked amount status and income through grouped undo and redo', () => {
    const payment = salary();
    const bookingId = salaryBooking(40_000);
    matchOccurrences(db, TODAY);
    const march = occurrencesOf(payment.id).find((row) => row.dueDate === '2026-03-01')!;
    expect(march).toMatchObject({ status: 'received', bookingId });
    expect(marchIncome()).toMatchObject({ expectedCents: 40_000, receivedCents: 40_000 });

    updateBooking(db, bookingId, { amountCents: 39_000 }, { ...ctx, groupId: 'salary-edit' });
    expect(occurrencesOf(payment.id).find((row) => row.id === march.id)).toMatchObject({
      status: 'deviating',
      bookingId,
    });
    expect(marchIncome()).toMatchObject({ expectedCents: 40_000, receivedCents: 39_000 });

    const undone = undo(db, { groupId: 'salary-edit' }, ctx);
    expect(occurrencesOf(payment.id).find((row) => row.id === march.id)).toMatchObject({
      status: 'received',
      bookingId,
    });
    expect(marchIncome()).toMatchObject({ receivedCents: 40_000 });
    undo(db, { groupId: undone.groupId }, ctx);
    expect(occurrencesOf(payment.id).find((row) => row.id === march.id)).toMatchObject({
      status: 'deviating',
      bookingId,
    });
    expect(marchIncome()).toMatchObject({ receivedCents: 39_000 });
  });

  it('requires the whole linked edit when undoing one audit row', () => {
    const payment = salary();
    const bookingId = salaryBooking(40_000);
    const unrelatedId = salaryBooking(1_000, '2026-03-03');
    matchOccurrences(db, TODAY);
    updateBooking(db, bookingId, { amountCents: 39_000 }, { ...ctx, groupId: 'linked-edit' });
    updateBooking(
      db,
      unrelatedId,
      { memo: 'same group, unrelated row' },
      { ...ctx, groupId: 'linked-edit' },
    );
    const bookingEntry = db
      .select()
      .from(auditLog)
      .where(eq(auditLog.groupId, 'linked-edit'))
      .all()
      .find((entry) => entry.entityType === 'booking' && entry.entityId === bookingId)!;
    expect(() => undo(db, { auditId: bookingEntry.id }, ctx)).toThrow(AuditError);
    expect(getBooking(db, bookingId)).toMatchObject({ amountCents: 39_000 });
    expect(occurrencesOf(payment.id).find((row) => row.dueDate === '2026-03-01')).toMatchObject({
      status: 'deviating',
      bookingId,
    });
    const unrelatedEntry = db
      .select()
      .from(auditLog)
      .where(eq(auditLog.groupId, 'linked-edit'))
      .all()
      .find((entry) => entry.entityType === 'booking' && entry.entityId === unrelatedId)!;
    expect(() => undo(db, { auditId: unrelatedEntry.id }, ctx)).not.toThrow();
    expect(getBooking(db, unrelatedId)?.memo).toBeNull();
  });

  it('clears a deleted linked booking and restores/removes the link with undo and redo', () => {
    const payment = salary();
    const bookingId = salaryBooking(40_000);
    matchOccurrences(db, TODAY);
    const march = occurrencesOf(payment.id).find((row) => row.dueDate === '2026-03-01')!;
    expect(marchIncome().receivedCents).toBe(40_000);

    deleteBooking(db, bookingId, { ...ctx, groupId: 'salary-delete' });
    expect(occurrencesOf(payment.id).find((row) => row.id === march.id)).toMatchObject({
      status: 'expected',
      bookingId: null,
    });
    expect(marchIncome().receivedCents).toBe(0);

    const undone = undo(db, { groupId: 'salary-delete' }, ctx);
    expect(occurrencesOf(payment.id).find((row) => row.id === march.id)).toMatchObject({
      status: 'received',
      bookingId,
    });
    expect(marchIncome().receivedCents).toBe(40_000);
    undo(db, { groupId: undone.groupId }, ctx);
    expect(occurrencesOf(payment.id).find((row) => row.id === march.id)).toMatchObject({
      status: 'expected',
      bookingId: null,
    });
    expect(marchIncome().receivedCents).toBe(0);
  });

  it('refuses to restore an unlinked occurrence to a deleted booking, including force undo', () => {
    const payment = salary();
    const bookingId = salaryBooking(40_000);
    const march = occurrencesOf(payment.id).find((row) => row.dueDate === '2026-03-01')!;
    linkOccurrence(db, march.id, bookingId, ctx);
    const unlinked = unlinkOccurrence(db, march.id, { ...ctx, groupId: 'manual-unlink' });
    deleteBooking(db, bookingId, ctx);

    expect(() => undo(db, { groupId: unlinked.groupId }, ctx)).toThrow(AuditError);
    expect(() => undo(db, { groupId: unlinked.groupId }, ctx, { force: true })).toThrow(AuditError);
    expect(occurrencesOf(payment.id).find((row) => row.id === march.id)).toMatchObject({
      status: 'missed',
      bookingId: null,
    });
    expect(
      db.select().from(booking).where(eq(booking.id, bookingId)).get()?.deletedAt,
    ).not.toBeNull();
    expect(marchIncome().receivedCents).toBe(0);
  });

  it('rematches a replacement after the linked booking is deleted', () => {
    const payment = salary();
    const oldId = salaryBooking(40_000);
    matchOccurrences(db, TODAY);
    deleteBooking(db, oldId, ctx);
    const replacementId = salaryBooking(40_000, '2026-03-02');

    expect(matchOccurrences(db, TODAY)).toMatchObject({ received: 1 });
    const march = occurrencesOf(payment.id).find((row) => row.dueDate === '2026-03-01')!;
    expect(march).toMatchObject({ status: 'received', bookingId: replacementId });
    expect(marchIncome().receivedCents).toBe(40_000);
  });

  it('repairs legacy deleted links and never reports deleted booking money', () => {
    const payment = salary();
    const bookingId = salaryBooking(40_000);
    matchOccurrences(db, TODAY);
    db.update(booking)
      .set({ deletedAt: '2026-03-21T00:00:00.000Z' })
      .where(eq(booking.id, bookingId))
      .run();

    expect(upcoming(db, '2026-03-01', '2026-03-01')[0]).toMatchObject({
      bookingId: null,
      bookedAmountCents: null,
      status: 'expected',
    });
    expect(marchIncome().receivedCents).toBe(0);
    refreshOccurrences(db, TODAY);
    expect(occurrencesOf(payment.id).find((row) => row.dueDate === '2026-03-01')).toMatchObject({
      status: 'expected',
      bookingId: null,
    });
    db.update(expectedOccurrence)
      .set({ bookingId, status: 'received' })
      .where(
        eq(
          expectedOccurrence.id,
          occurrencesOf(payment.id).find((row) => row.dueDate === '2026-03-01')!.id,
        ),
      )
      .run();
    matchOccurrences(db, TODAY);
    expect(occurrencesOf(payment.id).find((row) => row.dueDate === '2026-03-01')).toMatchObject({
      status: 'missed',
      bookingId: null,
    });
  });

  it('keeps manual links outside the date window and refreshes their amount status only', () => {
    const payment = salary();
    const bookingId = salaryBooking(40_000, '2026-01-01');
    const march = occurrencesOf(payment.id).find((row) => row.dueDate === '2026-03-01')!;
    linkOccurrence(db, march.id, bookingId, ctx);
    expect(occurrencesOf(payment.id).find((row) => row.id === march.id)).toMatchObject({
      status: 'received',
      bookingId,
    });

    updateBooking(
      db,
      bookingId,
      { amountCents: 39_000, date: '2026-05-01', accountId: 'spar' },
      ctx,
    );
    expect(occurrencesOf(payment.id).find((row) => row.id === march.id)).toMatchObject({
      status: 'deviating',
      bookingId,
    });
  });

  it('uses version ranges, tolerance and original-currency amounts on linked edits', () => {
    const ranged = createExpectedPayment(
      db,
      {
        name: 'Ranged inflow',
        kind: 'inflow',
        accountId: 'giro',
        payeeId: 'p1',
        dueDay: 1,
        startDate: '2026-01-01',
        amountToleranceCents: 100,
      },
      { validFrom: '2026-01-01', amountCents: 40_000, amountMaxCents: 45_000 },
      ctx,
      TODAY,
    ).payment;
    const rangedBooking = salaryBooking(44_000);
    const march = occurrencesOf(ranged.id).find((row) => row.dueDate === '2026-03-01')!;
    linkOccurrence(db, march.id, rangedBooking, ctx);
    updateBooking(db, rangedBooking, { amountCents: 45_050 }, ctx);
    expect(occurrencesOf(ranged.id).find((row) => row.id === march.id)).toMatchObject({
      status: 'received',
      bookingId: rangedBooking,
    });
    updateBooking(db, rangedBooking, { amountCents: 45_101 }, ctx);
    expect(occurrencesOf(ranged.id).find((row) => row.id === march.id)).toMatchObject({
      status: 'deviating',
      bookingId: rangedBooking,
    });

    const foreign = createExpectedPayment(
      db,
      {
        name: 'USD outflow',
        accountId: 'giro',
        payeeId: 'p1',
        dueDay: 8,
        startDate: '2026-01-01',
      },
      { validFrom: '2026-01-01', amountCents: 1_000, currency: 'USD' },
      ctx,
      TODAY,
    ).payment;
    const foreignBooking = createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-08',
        amountCents: -935,
        payeeId: 'p1',
        splits: [{ amountCents: -935 }],
        originalAmountCents: -1_000,
        originalCurrency: 'USD',
        fxRateMicro: 935_000,
      },
      ctx,
    );
    matchOccurrences(db, TODAY);
    const foreignMarch = occurrencesOf(foreign.id).find((row) => row.dueDate === '2026-03-08')!;
    expect(occurrencesOf(foreign.id).find((row) => row.id === foreignMarch.id)).toMatchObject({
      status: 'received',
      bookingId: foreignBooking,
    });
    updateBooking(db, foreignBooking, { memo: 'foreign amount unchanged' }, ctx);
    expect(occurrencesOf(foreign.id).find((row) => row.id === foreignMarch.id)).toMatchObject({
      status: 'received',
      bookingId: foreignBooking,
    });
    updateBooking(db, foreignBooking, { amountCents: -1_029, originalAmountCents: -1_100 }, ctx);
    expect(occurrencesOf(foreign.id).find((row) => row.id === foreignMarch.id)).toMatchObject({
      status: 'deviating',
      bookingId: foreignBooking,
    });
  });

  it('refreshes linked transfer mirror amounts', () => {
    const payment = createExpectedPayment(
      db,
      {
        name: 'Transfer inflow',
        kind: 'inflow',
        accountId: 'spar',
        dueDay: 1,
        startDate: '2026-01-01',
      },
      { validFrom: '2026-01-01', amountCents: 50_000 },
      ctx,
      TODAY,
    ).payment;
    const transfer = createTransfer(
      db,
      { fromAccountId: 'giro', toAccountId: 'spar', date: '2026-03-01', amountCents: 50_000 },
      ctx,
    );
    const march = occurrencesOf(payment.id).find((row) => row.dueDate === '2026-03-01')!;
    linkOccurrence(db, march.id, transfer.toBookingId, ctx);
    updateBooking(db, transfer.fromBookingId, { amountCents: -60_000 }, ctx);
    expect(occurrencesOf(payment.id).find((row) => row.id === march.id)).toMatchObject({
      status: 'deviating',
      bookingId: transfer.toBookingId,
    });
  });
});

describe('skipping one occurrence (gestrichen)', () => {
  /** A salary on the 15th, 3.000,00 €, next to the rent on the 1st. */
  const salary = () =>
    createExpectedPayment(
      db,
      {
        name: 'Gehalt',
        kind: 'inflow',
        accountId: 'giro',
        incomeTypeId: db.select().from(incomeType).all()[0]!.id,
        dueDay: 15,
        startDate: '2026-01-01',
      },
      { validFrom: '2026-01-01', amountCents: 300_000 },
      ctx,
      TODAY,
    ).payment;
  const row = (paymentId: string, dueDate: string) =>
    occurrencesOf(paymentId).find((o) => o.dueDate === dueDate);
  const forecastItems = () => forecastInputs(loadFacts(db, TODAY), TODAY, { byAccount: {} }).items;
  const forecastDays = () => forecastItems().map((i) => i.day);

  it('creates the row of a not yet materialised occurrence and is idempotent', () => {
    const p = salary();
    db.delete(expectedOccurrence).run();
    expect(occurrencesOf(p.id)).toEqual([]);
    const first = skipOccurrence(db, p.id, '2026-05-15', ctx, TODAY);
    expect(first.occurrence).toMatchObject({
      dueDate: '2026-05-15',
      status: 'skipped',
      expectedAmountCents: 300_000,
      bookingId: null,
    });
    expect(skipOccurrence(db, p.id, '2026-05-15', ctx, TODAY).occurrence.id).toBe(
      first.occurrence.id,
    );
    expect(occurrencesOf(p.id)).toHaveLength(1);
  });

  it('skips a materialised row without touching the rule or the other rows', () => {
    const p = salary();
    const before = occurrencesOf(p.id);
    skipOccurrence(db, p.id, '2026-04-15', ctx, TODAY);
    const after = occurrencesOf(p.id);
    expect(after.map((o) => [o.dueDate, o.status])).toEqual(
      before.map((o) => [o.dueDate, o.dueDate === '2026-04-15' ? 'skipped' : 'expected']),
    );
    expect(listExpectedPayments(db, TODAY).find((x) => x.id === p.id)).toMatchObject({
      dueDay: 15,
      amountCents: 300_000,
    });
  });

  it('refuses a date that is no occurrence of the rule or lies outside the window', () => {
    const p = salary();
    for (const day of ['2026-05-14', '2025-01-15', '2028-05-15', 'morgen'])
      expect(() => skipOccurrence(db, p.id, day, ctx, TODAY), day).toThrow(RangeError);
    expect(() => skipOccurrence(db, 'gibt-es-nicht', '2026-05-15', ctx, TODAY)).toThrow(
      EntityNotFoundError,
    );
  });

  it('refuses an occurrence that is linked to a booking', () => {
    const p = salary();
    const march = row(p.id, '2026-03-15')!;
    const id = book('2026-03-15', 300_000, null);
    linkOccurrence(db, march.id, id, ctx);
    expect(() => skipOccurrence(db, p.id, '2026-03-15', ctx, TODAY)).toThrow(ConflictError);
    expect(row(p.id, '2026-03-15')).toMatchObject({ status: 'received', bookingId: id });
  });

  it('undo of the skip group removes the row it created', () => {
    const p = salary();
    db.delete(expectedOccurrence).run();
    const { groupId } = skipOccurrence(db, p.id, '2026-05-15', ctx, TODAY);
    undo(db, { groupId }, ctx);
    expect(occurrencesOf(p.id)).toEqual([]);
    // The soft-deleted row is revived by a second skip, not duplicated.
    skipOccurrence(db, p.id, '2026-05-15', ctx, TODAY);
    expect(occurrencesOf(p.id).map((o) => o.status)).toEqual(['skipped']);
  });

  it('refresh and re-planning leave a skipped row alone, even if the rule moves away from it', () => {
    const p = salary();
    skipOccurrence(db, p.id, '2026-04-15', ctx, TODAY);
    addExpectedVersion(db, p.id, { validFrom: '2026-04-01', amountCents: 320_000 }, ctx, TODAY);
    refreshOccurrences(db, '2026-04-02');
    expect(row(p.id, '2026-04-15')).toMatchObject({
      status: 'skipped',
      expectedAmountCents: 300_000,
    });
    expect(row(p.id, '2026-05-15')?.expectedAmountCents).toBe(320_000);
    updateExpectedPayment(db, p.id, { dueDay: 20 }, ctx, TODAY);
    expect(row(p.id, '2026-04-15')).toMatchObject({ status: 'skipped' });
    expect(row(p.id, '2026-04-20')?.status).toBe('expected');
    deleteExpectedPayment(db, p.id, ctx, TODAY);
    restoreExpectedPayment(db, p.id, ctx, TODAY);
    expect(row(p.id, '2026-04-15')).toMatchObject({ status: 'skipped' });
  });

  it('unskip brings it back as expected with the current amount; only a skipped one', () => {
    const p = salary();
    const april = skipOccurrence(db, p.id, '2026-04-15', ctx, TODAY).occurrence;
    addExpectedVersion(db, p.id, { validFrom: '2026-04-01', amountCents: 320_000 }, ctx, TODAY);
    const back = unskipOccurrence(db, april.id, ctx, TODAY);
    expect(back.occurrence).toMatchObject({
      id: april.id,
      status: 'expected',
      expectedAmountCents: 320_000,
    });
    expect(() => unskipOccurrence(db, april.id, ctx, TODAY)).toThrow(ConflictError);
    expect(() => unskipOccurrence(db, 'gibt-es-nicht', ctx, TODAY)).toThrow(EntityNotFoundError);
  });

  it('cannot be marked ausgefallen while skipped', () => {
    const p = salary();
    const april = skipOccurrence(db, p.id, '2026-04-15', ctx, TODAY).occurrence;
    expect(() => markOccurrenceMissed(db, april.id, ctx)).toThrow(ConflictError);
  });

  it('is never matched to a booking, not even one that fits exactly', () => {
    const p = salary();
    skipOccurrence(db, p.id, '2026-04-15', ctx, TODAY);
    book('2026-04-15', 300_000, null);
    expect(matchOccurrences(db, '2026-04-20').received).toBe(0);
    expect(row(p.id, '2026-04-15')).toMatchObject({ status: 'skipped', bookingId: null });
    // Replacement income of another amount and day is just income, never a deviation of it.
    book('2026-04-28', 180_000, null);
    expect(matchOccurrences(db, '2026-04-30').deviating).toBe(0);
    expect(row(p.id, '2026-04-15')?.status).toBe('skipped');
  });

  it('leaves the skipped occurrence out of the forecast; the others stay', () => {
    const p = salary();
    expect(forecastDays()).toContain('2026-04-15');
    skipOccurrence(db, p.id, '2026-04-15', ctx, TODAY);
    const items = forecastItems().filter((i) => i.kind === 'income');
    expect(items.map((i) => i.day).slice(0, 3)).toEqual(['2026-05-15', '2026-06-15', '2026-07-15']);
    expect(items.find((i) => i.day === '2026-05-15')).toMatchObject({
      cents: 300_000,
      kind: 'income',
      ref: { paymentId: p.id, dueDate: '2026-05-15' },
    });
    unskipOccurrence(db, row(p.id, '2026-04-15')!.id, ctx, TODAY);
    expect(forecastDays()).toContain('2026-04-15');
  });

  it('skips an occurrence that is not materialised yet out of the forecast', () => {
    const p = salary();
    db.delete(expectedOccurrence).run();
    skipOccurrence(db, p.id, '2026-04-15', ctx, TODAY);
    expect(forecastDays()).not.toContain('2026-04-15');
    expect(forecastDays()).toContain('2026-05-15');
  });

  it('a missed occurrence ahead is out of the forecast as well, a past one stays a listed gap', () => {
    const p = salary();
    markOccurrenceMissed(db, row(p.id, '2026-04-15')!.id, ctx);
    expect(forecastDays()).not.toContain('2026-04-15');
    const f = loadFacts(db, TODAY);
    const days = (opts: { keepMissed?: boolean }) =>
      scheduled(f, '2026-04-01', '2026-04-30', TODAY, opts).map((o) => o.dueDate);
    expect(days({})).toEqual([]);
    expect(days({ keepMissed: true })).toEqual(['2026-04-15']);
  });

  it('upcoming and monthIncome leave skipped rows out unless asked', () => {
    const p = salary();
    skipOccurrence(db, p.id, '2026-04-15', ctx, TODAY);
    expect(upcoming(db, '2026-04-01', '2026-04-30')).toEqual([]);
    expect(upcoming(db, '2026-04-01', '2026-04-30', { includeSkipped: true })).toMatchObject([
      { paymentId: p.id, status: 'skipped', dueDate: '2026-04-15' },
    ]);
    expect(monthIncome(db, '2026-04')).toMatchObject({ expectedCents: 0, byPayment: [] });
    expect(monthIncome(db, '2026-05').expectedCents).toBe(300_000);
  });
});
