import {
  accountBalances as pureBalances,
  allocation,
  assignedMonth,
  chainReturns,
  marketValueCents,
  monthlyPortfolioReturn,
  unitsHeld,
  type AssignedCategory,
} from '@budget/domain';
import {
  accountBalances,
  activityByCategoryMonth,
  createTestDatabase,
  schema,
  type Db,
} from '@budget/db';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from './seed';

let db: Db;
beforeAll(() => {
  db = createTestDatabase().db;
  seedDatabase(db);
});

const monthEnds = () =>
  db
    .select({ date: schema.price.date })
    .from(schema.price)
    .where(eq(schema.price.securityId, 'sec-etfw'))
    .all()
    .map((r) => r.date)
    .sort();

/** Units and price of every security on a date, straight from the seeded rows. */
function positions(date: string) {
  const securities = db.select().from(schema.security).all();
  const holdings = db.select().from(schema.holding).all();
  const trades = db.select().from(schema.trade).all();
  const prices = db.select().from(schema.price).all();
  return securities.map((s) => {
    const snapshot = holdings
      .filter((h) => h.securityId === s.id)
      .sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
    const units = unitsHeld(
      snapshot ? { asOf: snapshot.asOf, unitsE8: snapshot.unitsE8 } : undefined,
      trades
        .filter((t) => t.securityId === s.id)
        .map((t) => ({ date: t.date, unitsE8: t.unitsE8 })),
      date,
    );
    const price = prices
      .filter((p) => p.securityId === s.id && p.date <= date)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    return {
      id: s.id,
      units,
      priceMicro: price?.priceMicro ?? 0,
      valueCents: marketValueCents(units, price?.priceMicro ?? 0),
    };
  });
}

describe('figures of the prototype are reproduced from the seeded database', () => {
  it('net worth on 17.09.2026 = 84.730,00 EUR', () => {
    const balances = accountBalances(db, '2026-09-17');
    const cash = balances.reduce((a, b) => a + b.balanceCents, 0);
    const invested = positions('2026-09-17').reduce((a, p) => a + p.valueCents, 0);
    expect(cash + invested).toBe(8473000);
    expect(Object.fromEntries(balances.map((b) => [b.accountId, b.balanceCents]))).toMatchObject({
      'acc-giro': 161700,
      'acc-kredit': -1217600,
    });
    // The pure domain function agrees with the SQL aggregate.
    const accounts = db.select().from(schema.account).all();
    const bookings = db.select().from(schema.booking).all();
    const pure = pureBalances(accounts, bookings, '2026-09-17');
    for (const b of balances) expect(pure.get(b.accountId), b.accountId).toBe(b.balanceCents);
  });

  it('August 2026 allocation: Bedarf 54 %, Wunsch 33 %, Zukunft 26 %, aus Guthaben -13 % (One-Pager)', () => {
    const month = '2026-08';
    const year = 2026;
    const categories = db.select().from(schema.category).all();
    const activity = activityByCategoryMonth(db);
    const spent = (categoryId: string) =>
      -(activity.find((a) => a.categoryId === categoryId && a.month === month)?.cents ?? 0);
    const versions = db.select().from(schema.expectedPaymentVersion).all();
    const payments = db.select().from(schema.expectedPayment).all();
    /** Amount of an expected payment on a date: the latest version that started on or before it. */
    const amountOn = (paymentId: string, date: string) =>
      versions
        .filter((v) => v.expectedPaymentId === paymentId && v.validFrom <= date)
        .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0]?.amountCents ?? 0;
    const due = (p: { dueMonth: number | null }, day: number) =>
      `${year}-${String(p.dueMonth).padStart(2, '0')}-${day}`;

    // Special payments: two per year at today's salary level (expected inflows that fall due once a year).
    const specialAnnual = payments
      .filter((p) => p.kind === 'inflow' && p.rhythm === 'yearly')
      .reduce((a, p) => a + amountOn(p.id, due(p, 15)), 0);
    const r12 = db.select().from(schema.rule).where(eq(schema.rule.code, 'R12')).get();
    const windfall =
      (JSON.parse(r12?.paramsJson ?? '{}') as { windfallShares?: Record<string, number> })
        .windfallShares ?? {};

    // Regular income: everything booked as inflow on budget and reserve accounts, without special payments.
    const roles = new Map(
      db
        .select()
        .from(schema.account)
        .all()
        .map((a) => [a.id, a.role]),
    );
    const regularIncome = db
      .select()
      .from(schema.booking)
      .all()
      .filter(
        (b) =>
          b.date.startsWith(month) &&
          !b.transferId &&
          b.amountCents > 0 &&
          ['budget', 'reserve'].includes(roles.get(b.accountId) ?? '') &&
          b.memo !== 'Sonderzahlung',
      )
      .reduce((a, b) => a + b.amountCents, 0);

    const assigned: AssignedCategory[] = categories.map((c) => {
      if (c.kind === 'periodic') {
        const annual = payments
          .filter((p) => p.categoryId === c.id && p.rhythm === 'yearly')
          .reduce((a, p) => a + amountOn(p.id, due(p, 12)), 0);
        return {
          class: c.class,
          kind: 'periodic',
          actualCents: spent(c.id),
          annualPlannedCents: annual,
        };
      }
      const share = windfall[c.id.replace('cat-', '')];
      if (share !== undefined) {
        const regular = payments
          .filter((p) => p.categoryId === c.id)
          .reduce((a, p) => a + amountOn(p.id, `${month}-15`), 0);
        return {
          class: c.class,
          kind: 'windfall',
          actualCents: spent(c.id),
          regularCents: regular,
          windfallShare: share,
        };
      }
      return { class: c.class, kind: 'regular', actualCents: spent(c.id) };
    });

    const result = allocation([
      assignedMonth({
        regularIncomeCents: regularIncome,
        specialIncomeAnnualCents: specialAnnual,
        categories: assigned,
      }),
    ]);
    expect(result.shares).toEqual({ need: 54, want: 33, future: 26, rest: -13 });
    expect(result.needCents + result.wantCents + result.futureCents + result.restCents).toBe(
      result.incomeCents,
    );
  });

  it('portfolio TTWROR: last 12 months +12,4 %, since October 2023 +38,2 %', () => {
    const dates = monthEnds(); // 2023-09-30 followed by 36 month ends
    const prices = db.select().from(schema.price).all();
    const monthly: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      const previous = positions(dates[i - 1] as string);
      const rates = previous.map((p) => {
        const now =
          prices.find((x) => x.securityId === p.id && x.date === dates[i])?.priceMicro ?? 0;
        return { previousValueCents: p.valueCents, returnRate: now / p.priceMicro - 1 };
      });
      monthly.push(monthlyPortfolioReturn(rates));
    }
    expect(monthly).toHaveLength(36);
    expect(chainReturns(monthly.slice(24)) * 100).toBeCloseTo(12.4, 1);
    expect(chainReturns(monthly) * 100).toBeCloseTo(38.2, 1);
  });

  it('the seeded database is deterministic: a second seed produces identical data', () => {
    const other = createTestDatabase().db;
    seedDatabase(other);
    // Row timestamps (created_at, updated_at) are the only values that come from the clock.
    const strip = <T extends { createdAt: string; updatedAt: string }>(rows: T[]) =>
      rows.map((row) => {
        const { createdAt, updatedAt, ...rest } = row;
        void createdAt;
        void updatedAt;
        return rest;
      });
    expect(strip(other.select().from(schema.booking).all())).toEqual(
      strip(db.select().from(schema.booking).all()),
    );
  });
});
