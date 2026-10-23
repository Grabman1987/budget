import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { booking, bookingDelivery, bookingSplit, transfer, auditLog } from '../schema';
import { accounts } from './entities';
import { createBooking, createTransfer, getBooking, importTransfer } from './bookings';
import { BookingInvariantError } from './errors';

let opened: OpenedDatabase;
const day = '2026-10-20';
const ctx = { actor: 'fixture585' };
const input = { fromAccountId: 'cash585', toAccountId: 'bank585', date: day, amountCents: 12345 };
beforeEach(() => {
  opened = createTestDatabase();
  accounts.create(
    opened.db,
    {
      id: 'cash585',
      name: 'Bargeld Muster',
      type: 'cash',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 50000,
    },
    ctx,
  );
  accounts.create(
    opened.db,
    {
      id: 'bank585',
      name: 'Giro Muster',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 100000,
    },
    ctx,
  );
});
afterEach(() => opened.close());
const snapshot = () => ({
  bookings: opened.db.select().from(booking).all(),
  splits: opened.db.select().from(bookingSplit).all(),
  transfers: opened.db.select().from(transfer).all(),
  audit: opened.db.select().from(auditLog).all(),
  delivery: opened.db.select().from(bookingDelivery).all(),
});

describe('legacy non-opted-in transfer controls #585', () => {
  it.each([undefined, 'pending', 'confirmed', 'reconciled'] as const)(
    'keeps source-omitted operator-style %s status on both legs in both directions',
    (status) => {
      for (const reverse of [false, true]) {
        const result = createTransfer(
          opened.db,
          {
            ...input,
            ...(reverse ? { fromAccountId: 'bank585', toAccountId: 'cash585' } : {}),
            ...(status === undefined ? {} : { status }),
          },
          ctx,
        );
        expect(getBooking(opened.db, result.fromBookingId)).toMatchObject({
          amountCents: -12345,
          status: status ?? 'confirmed',
          source: 'manual',
        });
        expect(getBooking(opened.db, result.toBookingId)).toMatchObject({
          amountCents: 12345,
          status: status ?? 'confirmed',
          source: 'manual',
        });
      }
    },
  );
  it.each(['pending', 'confirmed', 'reconciled'] as const)(
    'preserves imported %s pair and duplicate no-write replay',
    (status) => {
      const result = importTransfer(
        opened.db,
        { ...input, status, importKey: 'synthetic-import585' },
        ctx,
      );
      expect(result.outcome).toBe('created');
      expect(getBooking(opened.db, result.fromBookingId)).toMatchObject({
        amountCents: -12345,
        status,
        source: 'import',
      });
      expect(getBooking(opened.db, result.toBookingId)).toMatchObject({
        amountCents: 12345,
        status,
        source: 'import',
      });
      const before = snapshot();
      expect(
        importTransfer(opened.db, { ...input, status, importKey: 'synthetic-import585' }, ctx),
      ).toMatchObject({
        transferId: result.transferId,
        fromBookingId: result.fromBookingId,
        toBookingId: result.toBookingId,
        outcome: 'existing',
      });
      expect(snapshot()).toEqual(before);
    },
  );
  it('keeps a pending split-level transfer partner pending, including the cash side', () => {
    const id = createBooking(
      opened.db,
      {
        accountId: 'bank585',
        date: day,
        amountCents: -12345,
        status: 'pending',
        splits: [{ categoryId: null, amountCents: -12345, transferAccountId: 'cash585' }],
      },
      ctx,
    );
    expect(getBooking(opened.db, id)).toMatchObject({ amountCents: -12345, status: 'pending' });
    expect(opened.db.select().from(booking).all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: 'cash585', amountCents: 12345, status: 'pending' }),
      ]),
    );
  });
  it('does not rewrite old pending/confirmed/reconciled pairs when a new opted-in pair is created', () => {
    const ids = (['pending', 'confirmed', 'reconciled'] as const).flatMap((status) => {
      const result = createTransfer(opened.db, { ...input, status }, ctx);
      return [result.fromBookingId, result.toBookingId];
    });
    const old = ids.map((id) => getBooking(opened.db, id));
    const current = createTransfer(opened.db, input, ctx, { manualCashBank: {} });
    expect(getBooking(opened.db, current.fromBookingId)?.status).toBe('confirmed');
    expect(getBooking(opened.db, current.toBookingId)?.status).toBe('pending');
    expect(ids.map((id) => getBooking(opened.db, id))).toEqual(old);
  });
  it.each(['pending', 'confirmed'] as const)(
    'refuses %s bank-specific intent before inserting even the structural row for a credit-card transfer',
    (bankStatus) => {
      accounts.create(
        opened.db,
        {
          id: 'card585',
          name: 'Karte Muster',
          type: 'credit_card',
          role: 'budget',
          onBudget: true,
          openingDate: '2026-01-01',
        },
        ctx,
      );
      const before = snapshot();
      expect(() =>
        createTransfer(opened.db, { ...input, toAccountId: 'card585' }, ctx, {
          manualCashBank: { bankStatus },
        }),
      ).toThrow(BookingInvariantError);
      expect(snapshot()).toEqual(before);
      const ordinary = createTransfer(
        opened.db,
        { ...input, toAccountId: 'card585', status: 'pending' },
        ctx,
        { manualCashBank: {} },
      );
      expect(getBooking(opened.db, ordinary.fromBookingId)?.status).toBe('pending');
      expect(getBooking(opened.db, ordinary.toBookingId)?.status).toBe('pending');
    },
  );
});
