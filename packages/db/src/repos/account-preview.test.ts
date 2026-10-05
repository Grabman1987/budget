import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { seedBasics } from './test-helpers';
import { accountPreview } from './account-preview';
import { createBooking } from './bookings';
import { createExpectedPayment, linkOccurrence, upcoming } from './expected';
import { fxRate } from '../schema';
import { balanceSeries } from './ledger-queries';

let opened: OpenedDatabase;
const ctx = { actor: 'tester' };
const today = '2026-10-04';
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
const booking = (date: string, amountCents: number) =>
  createBooking(
    opened.db,
    {
      accountId: 'giro',
      date,
      amountCents,
      payeeId: 'p1',
      status: 'pending',
      splits: [{ categoryId: 'miete', amountCents }],
    },
    ctx,
  );
const recurring = (over = {}) =>
  createExpectedPayment(
    opened.db,
    {
      name: 'Musterzahlung',
      accountId: 'giro',
      payeeId: 'p1',
      categoryId: 'miete',
      rhythm: 'weekly',
      dueDay: 6,
      startDate: '2026-10-06',
      ...over,
    },
    { amountCents: 1001, validFrom: '2026-10-06' },
    ctx,
    today,
  );

describe('account preview', () => {
  it('adds pending and due payments to cash in exact cents, without writing or double counting', () => {
    booking(today, -1234);
    const pending = booking('2026-10-06', -1001);
    const payment = recurring();
    const occ = upcoming(opened.db, '2026-10-06', '2026-10-06')[0]!;
    linkOccurrence(opened.db, occ.occurrenceId, pending, ctx);
    recurring({ name: 'Anderes Konto', accountId: 'spar', payeeId: null, categoryId: null });
    const before = opened.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_log').get();
    const result = accountPreview(opened.db, 'giro', 'EUR', today, 10);
    expect(result.points[0]).toEqual({ date: today, balanceCents: 98766 });
    expect(result.points[2]).toEqual({ date: '2026-10-06', balanceCents: 97765 });
    expect(result.points.at(-1)).toEqual({ date: '2026-10-14', balanceCents: 96764 });
    expect(opened.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_log').get()).toEqual(before);
    expect(payment.payment.rhythm).toBe('weekly');
  });
  it('deduplicates an unlinked pending payment, including one already in today’s cash', () => {
    booking('2026-10-04', -1001);
    recurring();
    const result = accountPreview(opened.db, 'giro', 'EUR', today, 10);
    expect(result.points[2]!.balanceCents).toBe(98999);
    expect(result.points.at(-1)!.balanceCents).toBe(97998);
  });
  it('0 disables preview, boundaries validate, full ledger range works', () => {
    expect(accountPreview(opened.db, 'giro', 'EUR', today, 0).points).toEqual([]);
    expect(accountPreview(opened.db, 'giro', 'EUR', today, 365).points).toHaveLength(366);
    expect(() => accountPreview(opened.db, 'giro', 'EUR', today, 366)).toThrow();
    expect(
      balanceSeries(opened.db, 'giro', { from: '2023-10-01', to: today })[0]!.balanceCents,
    ).toBe(100000);
  });
  it('does not claim a complete native preview with an missing recurring currency rate', () => {
    createExpectedPayment(
      opened.db,
      {
        name: 'Fremdwährung Muster',
        accountId: 'giro',
        rhythm: 'monthly',
        dueDay: 6,
        startDate: '2026-10-06',
      },
      { amountCents: 1000, currency: 'USD', validFrom: '2026-10-06' },
      ctx,
      today,
    );
    expect(accountPreview(opened.db, 'giro', 'EUR', today, 35)).toEqual({
      points: [],
      unavailableCurrencies: ['USD'],
    });
  });
  it('uses stored FX as of today for foreign recurring payments', () => {
    createExpectedPayment(
      opened.db,
      {
        name: 'Fremdwährung Muster',
        accountId: 'giro',
        rhythm: 'weekly',
        dueDay: 6,
        startDate: '2026-10-06',
      },
      { amountCents: 1001, currency: 'USD', validFrom: '2026-10-06' },
      ctx,
      today,
    );
    opened.db
      .insert(fxRate)
      .values({ currency: 'USD', date: today, rateMicro: 900000, source: 'synthetic' })
      .run();
    const preview = accountPreview(opened.db, 'giro', 'EUR', today, 3);
    expect(preview.points.at(-1)).toEqual({ date: '2026-10-07', balanceCents: 99099 });
    expect(preview.unavailableCurrencies).toEqual([]);
  });
  it('deduplicates a foreign pending booking by its original amount, as matching does', () => {
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-10-06',
        amountCents: -901,
        originalAmountCents: -1001,
        originalCurrency: 'USD',
        fxRateMicro: 900000,
        payeeId: 'p1',
        status: 'pending',
        splits: [{ categoryId: 'miete', amountCents: -901 }],
      },
      ctx,
    );
    createExpectedPayment(
      opened.db,
      {
        name: 'Fremdwährung Muster',
        accountId: 'giro',
        payeeId: 'p1',
        rhythm: 'weekly',
        dueDay: 6,
        startDate: '2026-10-06',
      },
      { amountCents: 1001, currency: 'USD', validFrom: '2026-10-06' },
      ctx,
      today,
    );
    expect(accountPreview(opened.db, 'giro', 'EUR', today, 3)).toMatchObject({
      points: [
        { date: today, balanceCents: 100000 },
        { date: '2026-10-05', balanceCents: 100000 },
        { date: '2026-10-06', balanceCents: 99099 },
        { date: '2026-10-07', balanceCents: 99099 },
      ],
      unavailableCurrencies: [],
    });
  });
});
