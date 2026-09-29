import {
  accountBalances,
  allocationMonth,
  budget,
  createTestDatabase,
  holdingValuesAsOf,
  netWorthAsOf,
  schema,
  type Db,
} from '@budget/db';
import {
  accountBalances as pureBalances,
  allocation,
  chainReturns,
  lastDayOfMonth,
  monthlyPortfolioReturn,
  monthsBetween,
} from '@budget/domain';
import { eq, isNull } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { NOW, referenceModel } from './reference/model';
import { seedDatabase } from './seed';

let db: Db;
beforeAll(() => {
  db = createTestDatabase().db;
  seedDatabase(db);
});

const MONTHS = monthsBetween('2023-10', '2026-09');
/** Month ends of the sample; the last month ends "today", 17.09.2026. */
const monthEnd = (month: string) => (month === '2026-09' ? '2026-09-17' : lastDayOfMonth(month));

describe('figures of the prototype are reproduced from the seeded database', () => {
  it('net worth on 17.09.2026 = 84.730,00 EUR with the prototype’s account split', () => {
    const today = netWorthAsOf(db, '2026-09-17');
    expect(today.totalCents).toBe(8473000);
    const euros = (id: string) => (today.byAccount[`acc-${id}`] ?? 0) / 100;
    // The prototype's depot is split over two depots here (coverage: one ETF in two accounts).
    const split = { ...NOW, depot: euros('depot') + euros('depot2') };
    for (const [id, value] of Object.entries(NOW))
      expect(id === 'depot' ? split.depot : euros(id), id).toBeCloseTo(value, 2);
    // The accounts added for coverage (second depot, dollar account) hold nothing in cash.
    expect(today.byAccount['acc-usd']).toBe(0);
    // The pure domain function agrees with the SQL aggregate (live bookings only).
    const accounts = db.select().from(schema.account).all();
    const bookings = db.select().from(schema.booking).where(isNull(schema.booking.deletedAt)).all();
    const pure = pureBalances(accounts, bookings, '2026-09-17');
    for (const b of accountBalances(db, '2026-09-17'))
      expect(pure.get(b.accountId), b.accountId).toBe(b.balanceCents);
  });

  it('net worth at all 36 month ends matches the prototype within 2 cents', () => {
    const ref = referenceModel();
    MONTHS.forEach((month, k) => {
      const cents = netWorthAsOf(db, monthEnd(month)).totalCents;
      expect(Math.abs(cents - Math.round((ref.nw[k] as number) * 100)), month).toBeLessThanOrEqual(
        2,
      );
    });
  });

  it('holdings are kept per account: the same ETF in two depots adds up to the product value', () => {
    const today = holdingValuesAsOf(db, '2026-09-17');
    const em = today.filter((h) => h.securityId === 'sec-etfem');
    expect(em.map((h) => h.accountId)).toEqual(['acc-depot', 'acc-depot2']);
    expect(em[1]?.unitsE8).toBe(100_000_000);
    const depots = today.filter((h) => h.accountId.startsWith('acc-depot'));
    expect(depots.reduce((a, h) => a + h.valueCents, 0)).toBe(NOW.depot * 100);
  });

  it('August 2026 allocation in cents; shares by largest remainder (One-Pager: 54 / 33 / 26 / -13)', () => {
    const result = allocation([allocationMonth(db, '2026-08')]);
    expect(result).toMatchObject({
      needCents: 310103,
      wantCents: 192865,
      futureCents: 150888,
      incomeCents: 575788,
      restCents: 575788 - 310103 - 192865 - 150888,
    });
    // The prototype rounds each class and lets the rest take the difference (54 / 33 / 26 / -13);
    // largest remainder (C11) keeps every share within half a point: 33,50 % → 34, -13,56 % → -14.
    expect(result.shares).toEqual({ need: 54, want: 34, future: 26, rest: -14 });
  });

  it('portfolio TTWROR: last 12 months +12,4 %, since October 2023 +38,2 %', () => {
    const dates = ['2023-09-30', ...MONTHS.map(monthEnd)];
    const prices = db.select().from(schema.price).all();
    const priceOn = (id: string, date: string) =>
      prices.find((p) => p.securityId === id && p.date === date)?.priceMicro ?? 0;
    const monthly: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      const previous = holdingValuesAsOf(db, dates[i - 1] as string);
      const rates = previous.map((p) => ({
        previousValueCents: p.valueCents,
        returnRate: priceOn(p.securityId, dates[i] as string) / p.priceMicro - 1,
      }));
      monthly.push(monthlyPortfolioReturn(rates));
    }
    expect(monthly).toHaveLength(36);
    expect(chainReturns(monthly.slice(24)) * 100).toBeCloseTo(12.4, 1);
    expect(chainReturns(monthly) * 100).toBeCloseTo(38.2, 1);
  });

  it('the seeded database is deterministic: bookings, splits, trades, prices and envelopes', () => {
    const other = createTestDatabase().db;
    seedDatabase(other);
    // Row timestamps (created_at, updated_at) are the only values that come from the clock.
    const strip = (rows: Record<string, unknown>[]) =>
      rows.map((row) => {
        const rest = { ...row };
        delete rest['createdAt'];
        delete rest['updatedAt'];
        return rest;
      });
    const tables = [
      schema.booking,
      schema.bookingSplit,
      schema.trade,
      schema.price,
      schema.envelopeMonth,
      schema.holding,
    ] as const;
    for (const table of tables)
      expect(strip(other.select().from(table).all())).toEqual(strip(db.select().from(table).all()));
    // Derived figures follow: the whole budget of the sample is identical.
    expect(budget(other, MONTHS)).toEqual(budget(db, MONTHS));
    const moves = db.select().from(schema.booking).where(eq(schema.booking.memo, 'Umschichtung'));
    expect(moves.all()).toHaveLength(4);
  });
});
