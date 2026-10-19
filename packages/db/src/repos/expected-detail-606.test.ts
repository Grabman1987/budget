import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { auditLog, expectedOccurrence, expectedPaymentVersion } from '../schema';
import { createEntity } from './entities';
import { undo } from './audit';
import { createBooking, deleteBooking, updateBooking } from './bookings';
import {
  addExpectedVersion,
  createExpectedPayment,
  linkOccurrence,
  markOccurrenceMissed,
  skipOccurrence,
} from './expected';
import { readPaymentDetail } from './expected-detail';
import { seedBasics, testCtx as ctx } from './test-helpers';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());

function make(
  fields: Partial<Parameters<typeof createExpectedPayment>[1]> = {},
  version: Partial<Parameters<typeof createExpectedPayment>[2]> = {},
  today = '2024-01-15',
) {
  return createExpectedPayment(
    opened.db,
    {
      name: 'Synthetic payment',
      accountId: 'giro',
      dueDay: 20,
      startDate: '2024-01-01',
      ...fields,
    },
    { validFrom: '2024-01-01', amountCents: 1000, ...version },
    ctx,
    today,
  ).payment;
}

function stored(paymentId: string, dueDate: string, amountCents = -1000) {
  return (
    opened.db
      .select()
      .from(expectedOccurrence)
      .where(
        and(
          eq(expectedOccurrence.expectedPaymentId, paymentId),
          eq(expectedOccurrence.dueDate, dueDate),
        ),
      )
      .get() ??
    createEntity(
      opened.db,
      expectedOccurrence,
      {
        expectedPaymentId: paymentId,
        dueDate,
        expectedAmountCents: amountCents,
        status: 'expected',
      },
      ctx,
    )
  );
}

function booked(
  amountCents: number,
  date = '2026-09-20',
  original?: {
    originalAmountCents: number;
    originalCurrency: string;
    fxRateMicro: number;
    fxFeeCents: number;
  },
) {
  return createBooking(
    opened.db,
    {
      accountId: 'giro',
      date,
      amountCents,
      splits: [{ categoryId: 'miete', amountCents }],
      ...original,
    },
    ctx,
  );
}

describe('#606 payment-scoped factual history and current-rule preview', () => {
  it('reads real next monthly dates beyond stale materialization without changing any database bytes', () => {
    const p = make();
    const before = opened.sqlite.serialize();
    const result = readPaymentDetail(opened.db, p.id, '2026-09-17');
    expect(
      result.future
        .slice(0, 3)
        .map((r) => [r.dueDate, r.expectedAmountCents, r.status, r.source, r.occurrenceId]),
    ).toEqual([
      ['2026-09-20', -1000, 'expected', 'preview', null],
      ['2026-10-20', -1000, 'expected', 'preview', null],
      ['2026-11-20', -1000, 'expected', 'preview', null],
    ]);
    expect(result.future.filter((r) => r.dueDate <= '2026-10-22').map((r) => r.dueDate)).toEqual([
      '2026-09-20',
      '2026-10-20',
    ]);
    expect(result.future.filter((r) => r.dueDate <= '2026-12-16').map((r) => r.dueDate)).toEqual([
      '2026-09-20',
      '2026-10-20',
      '2026-11-20',
    ]);
    expect(result.future).toHaveLength(12);
    expect(result.hasFurtherFuture).toBe(true);
    expect(result.history[0]?.dueDate).toBe('2025-01-20');
    expect(result.future[0]).toMatchObject({
      booking: null,
      actualComparableCents: null,
      deviationCents: null,
      unavailableReason: 'missing_booking',
    });
    expect(opened.sqlite.serialize().equals(before)).toBe(true);
  });

  it('selects twelve stored weekly dues, not twelve calendar months, across older factual records', () => {
    const p = make({ rhythm: 'weekly', startDate: '2024-01-01' });
    const literal = [
      '2026-08-03',
      '2026-08-10',
      '2026-08-17',
      '2026-08-24',
      '2026-08-31',
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
    ];
    for (const day of literal) stored(p.id, day);
    const result = readPaymentDetail(opened.db, p.id, '2026-10-19');
    expect(result.history.map((r) => r.dueDate)).toEqual([...literal].reverse());
    expect(result.hasEarlierRecorded).toBe(true);
    expect(result.sparseHistory).toBe(false);
    expect(result.future.slice(0, 3).map((r) => r.dueDate)).toEqual([
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
    ]);
  });

  it('keeps quarterly factual records spanning nearly three years and does not synthesize missing history', () => {
    const p = make({ rhythm: 'quarterly', dueMonth: 1, dueDay: 15, startDate: '2024-01-01' });
    const literal = [
      '2024-01-15',
      '2024-04-15',
      '2024-07-15',
      '2024-10-15',
      '2025-01-15',
      '2025-04-15',
      '2025-07-15',
      '2025-10-15',
      '2026-01-15',
      '2026-04-15',
      '2026-07-15',
      '2026-10-15',
    ];
    for (const day of literal) stored(p.id, day);
    expect(readPaymentDetail(opened.db, p.id, '2026-10-19').history.map((r) => r.dueDate)).toEqual(
      [...literal].reverse(),
    );
    const later = make({ startDate: '2028-01-01' }, { validFrom: '2028-01-01' });
    const result = readPaymentDetail(opened.db, later.id, '2026-10-19');
    expect(result.history).toEqual([]);
    expect(result.sparseHistory).toBe(true);
    expect(result.future.slice(0, 3).map((r) => r.dueDate)).toEqual([
      '2028-01-20',
      '2028-02-20',
      '2028-03-20',
    ]);
  });

  it('projects annual and 52-week schedules far enough for three actual future dates', () => {
    const annual = make({ rhythm: 'yearly', dueMonth: 12, dueDay: 31 });
    expect(
      readPaymentDetail(opened.db, annual.id, '2026-10-19')
        .future.slice(0, 3)
        .map((r) => r.dueDate),
    ).toEqual(['2026-12-31', '2027-12-31', '2028-12-31']);
    const weekly = make(
      { rhythm: 'weekly', intervalWeeks: 52, startDate: '2026-10-19' },
      { validFrom: '2026-10-19' },
    );
    expect(
      readPaymentDetail(opened.db, weekly.id, '2026-10-19')
        .future.slice(0, 3)
        .map((r) => r.dueDate),
    ).toEqual(['2027-10-18', '2028-10-16', '2029-10-15']);
  });

  it('reuses month-end clamping and Austrian business-day shifts without a separate schedule engine', () => {
    const p = make({ dueDay: 31 });
    expect(
      readPaymentDetail(opened.db, p.id, '2026-01-01')
        .future.slice(0, 3)
        .map((r) => r.dueDate),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    const shifted = make({ dueDay: 31, dateShift: 'after' });
    expect(
      readPaymentDetail(opened.db, shifted.id, '2026-05-17')
        .future.slice(0, 3)
        .map((r) => r.dueDate),
    ).toEqual(['2026-06-01', '2026-06-30', '2026-07-31']);
  });

  it('preserves signed actual-minus-expected and the existing received status inside a range', () => {
    const p = make({}, {}, '2026-09-17');
    linkOccurrence(opened.db, stored(p.id, '2026-09-20').id, booked(-1100), ctx);
    expect(readPaymentDetail(opened.db, p.id, '2026-09-21').history[0]).toMatchObject({
      expectedAmountCents: -1000,
      actualComparableCents: -1100,
      deviationCents: -100,
      status: 'deviating',
    });
    const other = make({}, {}, '2026-09-17');
    linkOccurrence(opened.db, stored(other.id, '2026-09-20').id, booked(-900), ctx);
    expect(readPaymentDetail(opened.db, other.id, '2026-09-21').history[0]?.deviationCents).toBe(
      100,
    );
    const ranged = make(
      { kind: 'inflow' },
      { amountCents: 40000, amountMaxCents: 45000 },
      '2026-09-17',
    );
    linkOccurrence(opened.db, stored(ranged.id, '2026-09-20', 40000).id, booked(44000), ctx);
    expect(readPaymentDetail(opened.db, ranged.id, '2026-09-21').history[0]).toMatchObject({
      expectedAmountCents: 40000,
      actualComparableCents: 44000,
      deviationCents: 4000,
      status: 'received',
    });
    const cent = make({ kind: 'inflow' }, { amountCents: 50000 }, '2026-09-17');
    linkOccurrence(opened.db, stored(cent.id, '2026-09-20', 50000).id, booked(49999), ctx);
    expect(readPaymentDetail(opened.db, cent.id, '2026-09-21').history[0]?.deviationCents).toBe(-1);
  });

  it('uses comparable explicit original currency and exposes native booking units separately', () => {
    const p = make({}, { currency: 'USD' }, '2026-09-17');
    const id = booked(-935, '2026-09-20', {
      originalAmountCents: -1000,
      originalCurrency: 'USD',
      fxRateMicro: 935000,
      fxFeeCents: 0,
    });
    linkOccurrence(opened.db, stored(p.id, '2026-09-20').id, id, ctx);
    expect(readPaymentDetail(opened.db, p.id, '2026-09-21').history[0]).toMatchObject({
      currency: 'USD',
      actualComparableCents: -1000,
      deviationCents: 0,
      booking: { id, amountCents: -935, currency: 'EUR' },
      status: 'received',
    });
    updateBooking(opened.db, id, { amountCents: -1029, originalAmountCents: -1100 }, ctx);
    expect(readPaymentDetail(opened.db, p.id, '2026-09-21').history[0]).toMatchObject({
      actualComparableCents: -1100,
      deviationCents: -100,
      status: 'deviating',
    });
  });

  it('keeps missing and incomparable actuals null without substituting zero or 1:1 FX', () => {
    const p = make({}, { currency: 'USD' }, '2026-09-17');
    expect(readPaymentDetail(opened.db, p.id, '2026-09-21').history[0]).toMatchObject({
      actualComparableCents: null,
      deviationCents: null,
      unavailableReason: 'missing_booking',
    });
    linkOccurrence(opened.db, stored(p.id, '2026-09-20').id, booked(-935), ctx);
    expect(readPaymentDetail(opened.db, p.id, '2026-09-21').history[0]).toMatchObject({
      actualComparableCents: null,
      deviationCents: null,
      unavailableReason: 'currency_mismatch',
      booking: { amountCents: -935, currency: 'EUR' },
    });
  });

  it('retains stored expected snapshots and restores versioned future amounts through the original undo route', () => {
    const p = make();
    const version = addExpectedVersion(
      opened.db,
      p.id,
      { validFrom: '2026-10-01', amountCents: 5000 },
      ctx,
      '2026-09-17',
    );
    const result = readPaymentDetail(opened.db, p.id, '2026-09-17');
    expect(result.history[0]?.expectedAmountCents).toBe(-1000);
    expect(result.future.slice(0, 3).map((r) => r.expectedAmountCents)).toEqual([
      -1000, -5000, -5000,
    ]);
    undo(opened.db, { groupId: version.groupId }, ctx);
    expect(
      readPaymentDetail(opened.db, p.id, '2026-09-17')
        .future.slice(0, 3)
        .map((r) => r.expectedAmountCents),
    ).toEqual([-1000, -1000, -1000]);
  });

  it('keeps stored future skipped, linked and manually missed states authoritative with real identities', () => {
    const p = make({}, {}, '2026-09-17');
    skipOccurrence(opened.db, p.id, '2026-09-20', ctx, '2026-09-17');
    linkOccurrence(opened.db, stored(p.id, '2026-10-20').id, booked(-1000, '2026-10-20'), ctx);
    markOccurrenceMissed(opened.db, stored(p.id, '2026-11-20').id, ctx);
    const result = readPaymentDetail(opened.db, p.id, '2026-09-17');
    expect(result.future.slice(0, 3).map((r) => [r.dueDate, r.status, r.source])).toEqual([
      ['2026-09-20', 'skipped', 'stored'],
      ['2026-10-20', 'received', 'stored'],
      ['2026-11-20', 'missed', 'stored'],
    ]);
    expect(result.future.slice(0, 3).every((r) => r.occurrenceId !== null)).toBe(true);
    const before = opened.sqlite.serialize();
    readPaymentDetail(opened.db, p.id, '2026-09-17');
    expect(opened.sqlite.serialize().equals(before)).toBe(true);
  });

  it('follows real linked booking deletion and undo without repairing anything in the read', () => {
    const p = make({}, {}, '2026-09-17');
    const id = booked(-1100);
    linkOccurrence(opened.db, stored(p.id, '2026-09-20').id, id, ctx);
    deleteBooking(opened.db, id, { ...ctx, groupId: 'synthetic-delete-606' });
    expect(readPaymentDetail(opened.db, p.id, '2026-09-21').history[0]).toMatchObject({
      booking: null,
      actualComparableCents: null,
      deviationCents: null,
    });
    undo(opened.db, { groupId: 'synthetic-delete-606' }, ctx);
    expect(readPaymentDetail(opened.db, p.id, '2026-09-21').history[0]).toMatchObject({
      booking: { id },
      actualComparableCents: -1100,
      deviationCents: -100,
    });
  });

  it('does not invent future dates after the schedule ends', () => {
    const p = make({ endDate: '2024-12-31' });
    const result = readPaymentDetail(opened.db, p.id, '2026-09-17');
    expect(result.future).toEqual([]);
    expect(result.history.every((r) => r.source === 'stored' && r.dueDate <= '2024-12-31')).toBe(
      true,
    );
  });

  it.each([1000, 2000])(
    'does not relabel stored EUR history with a backdated USD version of %i cents',
    (newAmount) => {
      const p = make({}, {}, '2026-09-17');
      const august = stored(p.id, '2026-08-20');
      linkOccurrence(opened.db, august.id, booked(-1000, '2026-08-20'), ctx);
      expect(readPaymentDetail(opened.db, p.id, '2026-09-17').history[0]).toMatchObject({
        currency: 'EUR',
        expectedAmountCents: -1000,
        actualComparableCents: -1000,
        deviationCents: 0,
      });
      addExpectedVersion(
        opened.db,
        p.id,
        { validFrom: '2026-08-01', amountCents: newAmount, currency: 'USD' },
        ctx,
        '2026-09-17',
      );
      const before = opened.sqlite.serialize();
      expect(readPaymentDetail(opened.db, p.id, '2026-09-17').history[0]).toMatchObject({
        currency: null,
        expectedAmountCents: -1000,
        actualComparableCents: null,
        deviationCents: null,
        unavailableReason: 'missing_currency',
        booking: { amountCents: -1000, currency: 'EUR' },
      });
      expect(opened.sqlite.serialize().equals(before)).toBe(true);
    },
  );

  it('treats an unchanged future stored amount as ambiguous while absent preview identities use the effective currency', () => {
    const p = make({ rhythm: 'yearly', dueMonth: 12, dueDay: 31 }, {}, '2026-09-17');
    const december = stored(p.id, '2026-12-31');
    const changed = addExpectedVersion(
      opened.db,
      p.id,
      { validFrom: '2026-08-01', amountCents: 1000, currency: 'USD' },
      ctx,
      '2026-09-17',
    );
    const result = readPaymentDetail(opened.db, p.id, '2026-09-17');
    expect(result.future.slice(0, 3).map((r) => [r.dueDate, r.source, r.currency])).toEqual([
      ['2026-12-31', 'stored', null],
      ['2027-12-31', 'preview', 'USD'],
      ['2028-12-31', 'preview', 'USD'],
    ]);
    expect(result.future[0]).toMatchObject({
      occurrenceId: december.id,
      expectedAmountCents: -1000,
      deviationCents: null,
    });
    const undone = undo(opened.db, { groupId: changed.groupId }, ctx);
    const restored = readPaymentDetail(opened.db, p.id, '2026-09-17');
    expect(restored.future[0]?.currency).toBeNull();
    expect(restored.future[1]?.currency).toBe('EUR');
    undo(opened.db, { groupId: undone.groupId }, ctx);
    expect(readPaymentDetail(opened.db, p.id, '2026-09-17').future[1]?.currency).toBe('USD');
  });

  it('keeps incomplete legacy CREATE evidence unknown even when all current cents and currencies match', () => {
    const p = make({}, {}, '2026-09-17');
    const august = stored(p.id, '2026-08-20');
    linkOccurrence(opened.db, august.id, booked(-1000, '2026-08-20'), ctx);
    // Only the disposable legacy fixture loses its proof; no production writer is changed.
    opened.db
      .delete(auditLog)
      .where(
        and(
          eq(auditLog.entityType, 'expected_occurrence'),
          eq(auditLog.entityId, august.id),
          eq(auditLog.action, 'create'),
        ),
      )
      .run();
    expect(readPaymentDetail(opened.db, p.id, '2026-09-17').history[0]).toMatchObject({
      expectedAmountCents: -1000,
      currency: null,
      actualComparableCents: null,
      deviationCents: null,
      unavailableReason: 'missing_currency',
      booking: { amountCents: -1000, currency: 'EUR' },
    });
  });

  it.each(['missing', 'malformed'])(
    'abstains when original version proof is %s instead of assuming EUR',
    (kind) => {
      const p = make({}, {}, '2026-09-17');
      const version = opened.db
        .select()
        .from(expectedPaymentVersion)
        .where(eq(expectedPaymentVersion.expectedPaymentId, p.id))
        .get()!;
      const where = and(
        eq(auditLog.entityType, 'expected_payment_version'),
        eq(auditLog.entityId, version.id),
        eq(auditLog.action, 'create'),
      );
      if (kind === 'missing') opened.db.delete(auditLog).where(where).run();
      else
        opened.db
          .update(auditLog)
          .set({ afterJson: '{invalid legacy snapshot' })
          .where(where)
          .run();
      const before = opened.sqlite.serialize();
      expect(readPaymentDetail(opened.db, p.id, '2026-09-17').future[0]).toMatchObject({
        currency: null,
        actualComparableCents: null,
        deviationCents: null,
        unavailableReason: 'missing_currency',
      });
      expect(opened.sqlite.serialize().equals(before)).toBe(true);
    },
  );

  it('includes retained different-currency version evidence even when the soft-deleted version row is absent', () => {
    const p = make({ rhythm: 'yearly', dueMonth: 12, dueDay: 31 }, {}, '2026-09-17');
    const changed = addExpectedVersion(
      opened.db,
      p.id,
      { validFrom: '2026-08-01', amountCents: 1000, currency: 'USD' },
      ctx,
      '2026-09-17',
    );
    undo(opened.db, { groupId: changed.groupId }, ctx);
    // Disposable incomplete legacy table fixture; retained financial audit still documents USD.
    opened.db
      .delete(expectedPaymentVersion)
      .where(eq(expectedPaymentVersion.id, changed.version.id))
      .run();
    const result = readPaymentDetail(opened.db, p.id, '2026-09-17');
    expect(result.future[0]?.currency).toBeNull();
    expect(result.future[1]).toMatchObject({
      source: 'preview',
      occurrenceId: null,
      currency: 'EUR',
    });
  });

  it('does not publish an unsafe difference from opposite-signed individually safe integer cents', () => {
    const p = make({}, { amountCents: 4503599627370496 }, '2026-09-17');
    const id = booked(4503599627370496);
    linkOccurrence(opened.db, stored(p.id, '2026-09-20').id, id, ctx);
    expect(readPaymentDetail(opened.db, p.id, '2026-09-21').history[0]).toMatchObject({
      currency: 'EUR',
      expectedAmountCents: -4503599627370496,
      actualComparableCents: 4503599627370496,
      deviationCents: null,
      unavailableReason: 'unsafe_difference',
      status: 'deviating',
    });
  });
});
