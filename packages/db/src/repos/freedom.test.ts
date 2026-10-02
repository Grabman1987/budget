import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../client';
import { rule, security, holding, price, booking, categoryGroup } from '../schema';
import { accounts, categories } from './entities';
import { createBooking } from './bookings';
import { undo } from './audit';
import { setManualPrice } from './prices';
import { freedomView } from './freedom';
import { ruleInputs } from './rule-inputs';
import { ensureDefaultRules } from './rules';
import { freedomExpenseMonths, freedomInvestedCents } from './freedom-inputs';

let db: ReturnType<typeof createTestDatabase>['db'];
const ctx = { actor: 'synthetic-test' };
const today = '2026-10-01';
function spend(date: string, amount: number, categoryId = 'need') {
  const groupId = randomUUID();
  const id = createBooking(
    db,
    { accountId: 'cash', date, amountCents: amount, splits: [{ categoryId, amountCents: amount }] },
    { ...ctx, groupId },
  );
  return { id, groupId };
}
beforeEach(() => {
  db = createTestDatabase().db;
  ensureDefaultRules(db);
  accounts.create(
    db,
    {
      id: 'cash',
      name: 'Budget',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      currency: 'EUR',
      openingDate: '2025-10-01',
      openingBalanceCents: 10_000_000,
    },
    ctx,
  );
  accounts.create(
    db,
    {
      id: 'invest',
      name: 'Anlage',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      currency: 'EUR',
      openingDate: '2025-10-01',
      openingBalanceCents: 100_000,
    },
    ctx,
  );
  db.insert(categoryGroup).values({ id: 'g', name: 'Testgruppe' }).run();
  categories.create(db, { id: 'need', groupId: 'g', name: 'Bedarf', class: 'need' }, ctx);
  categories.create(db, { id: 'want', groupId: 'g', name: 'Wunsch', class: 'want' }, ctx);
  categories.create(
    db,
    { id: 'future', groupId: 'g', name: 'Zukunft', class: 'future', kind: 'invest' },
    ctx,
  );
  db.insert(security).values({ id: 'sec', name: 'Testanlage', kind: 'etf', currency: 'EUR' }).run();
  db.insert(holding)
    .values({
      id: 'h',
      accountId: 'invest',
      securityId: 'sec',
      asOf: '2025-10-01',
      unitsE8: 100_000_000,
    })
    .run();
  db.insert(price)
    .values({
      securityId: 'sec',
      date: '2025-10-01',
      priceMicro: 5_000_000_000,
      currency: 'EUR',
      source: 'manual',
    })
    .run();
  for (const month of [
    '2025-10',
    '2025-11',
    '2025-12',
    ...Array.from({ length: 9 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`),
  ]) {
    spend(`${month}-15`, -10_000);
    spend(`${month}-15`, -2_000, 'want');
    spend(`${month}-16`, 2_000, 'want'); // refunds netted, not gross consumption
    spend(`${month}-17`, -99_999, 'future');
  }
});

describe('current freedom read model shares R16 sources', () => {
  it('literal expenses, investment cash + holdings, parameter override and parameter override', () => {
    const view = freedomView(db, today);
    expect(view).toMatchObject({
      annualSpendCents: 120_000,
      targetCents: 3_000_000,
      investedCents: 600_000,
      progressBp: 2000,
      multiple: 25,
      defaultRealReturnBp: 500,
      refMonth: '2026-09',
    });
    expect(view.months).toHaveLength(12);
    expect(view.months.every((m) => m.consumptionCents === 10_000)).toBe(true);
    expect(ruleInputs(db, today).freedom).toMatchObject({
      annualSpendCents: 120_000,
      investedCents: 600_000,
    });
    db.update(rule).set({ paramsJson: '{"multiple":20}' }).where(eq(rule.code, 'R16')).run();
    expect(freedomView(db, today)).toMatchObject({
      targetCents: 2_400_000,
      progressBp: 2500,
      multiple: 20,
    });
  });
  it('capture → refresh → undo; quote correction and undo preserve source parity', () => {
    const booking = spend('2026-09-20', -5_000);
    expect(freedomView(db, today)).toMatchObject({
      annualSpendCents: 125_000,
      targetCents: 3_125_000,
      progressBp: 1920,
    });
    undo(db, { groupId: booking.groupId }, ctx);
    expect(freedomView(db, today).progressBp).toBe(2000);
    const changed = setManualPrice(
      db,
      {
        securityId: 'sec',
        date: today,
        priceMicro: 6_000_000_000,
        currency: 'EUR',
      },
      ctx,
    );
    expect(freedomView(db, today).investedCents).toBe(700_000);
    undo(db, { groupId: changed.groupId }, ctx);
    expect(freedomView(db, today).investedCents).toBe(600_000);
  });
  it('reference month rolls over only on last day; short and empty history remain honest', () => {
    expect(freedomView(db, '2025-10-15').months).toEqual([]);
    // This asOf month includes the ledger month as in R16; it becomes the reference at month end.
    expect(freedomView(db, '2025-10-31')).toMatchObject({
      annualSpendCents: 120_000,
      refMonth: '2025-10',
    });
    db.update(booking).set({ deletedAt: '2026-10-01T00:00:00Z' }).run();
    spend('2025-10-15', -100);
    spend('2025-11-15', -200);
    expect(freedomView(db, '2025-11-30')).toMatchObject({ annualSpendCents: 1800 });
    const empty = freedomView(createTestDatabase().db, today);
    expect(empty).toMatchObject({
      months: [],
      annualSpendCents: 0,
      targetCents: 0,
      investedCents: 0,
      progressBp: null,
    });
  });
  it('unknown price/FX affects investments only; unrelated valuation does not suppress R16 basis', () => {
    db.delete(price).run();
    expect(freedomView(db, today)).toMatchObject({
      annualSpendCents: 120_000,
      targetCents: 3_000_000,
      investedCents: null,
      progressBp: null,
      accounts: [{ missingPrice: true }],
    });
    db.insert(price)
      .values({
        securityId: 'sec',
        date: '2025-10-01',
        priceMicro: 5_000_000_000,
        currency: 'CHF',
        source: 'manual',
      })
      .run();
    expect(freedomView(db, today).accounts[0]).toMatchObject({
      valueCents: null,
      missingFxCurrencies: ['CHF'],
    });
    db.update(price).set({ currency: 'EUR' }).run();
    accounts.create(
      db,
      {
        id: 'other',
        name: 'Andere Währung',
        type: 'checking',
        role: 'budget',
        currency: 'CHF',
        onBudget: false,
        openingDate: '2025-10-01',
        openingBalanceCents: 100,
      },
      ctx,
    );
    expect(freedomView(db, today).investedCents).toBe(600_000);
  });
  it('rejects an unsafe target/progress rather than emitting an approximate figure', () => {
    db.update(booking).set({ deletedAt: '2026-10-01T00:00:00Z' }).run();
    spend('2026-09-20', -900_000_000_000_000);
    expect(freedomView(db, today)).toMatchObject({
      annualSpendCents: 900_000_000_000_000,
      targetCents: null,
      progressBp: null,
      expensesUnsafe: true,
    });
  });
  it('matches tolerant rule parameter parsing, invalid values and soft-deleted rows', () => {
    for (const paramsJson of [
      'broken{',
      'null',
      '[]',
      '42',
      '{"multiple":0}',
      '{"multiple":"20"}',
      null,
    ]) {
      db.update(rule).set({ paramsJson }).where(eq(rule.code, 'R16')).run();
      expect(freedomView(db, today).multiple, String(paramsJson)).toBe(25);
    }
    db.update(rule)
      .set({ paramsJson: '{"multiple":20}', deletedAt: '2026-10-01T00:00:00Z' })
      .where(eq(rule.code, 'R16'))
      .run();
    expect(freedomView(db, today).multiple).toBe(25);
  });
  it('makes unsafe monthly source cents explicitly unavailable', () => {
    spend('2026-09-20', -9_007_199_254_740_000);
    spend('2026-09-21', -9_007_199_254_740_000);
    expect(freedomView(db, today)).toMatchObject({
      annualSpendCents: null,
      targetCents: null,
      progressBp: null,
      expensesUnsafe: true,
    });
    expect(freedomView(db, today).months.at(-1)?.consumptionCents).toBeNull();
  });
});

it('sums category and investment cancellation exactly with safe individual source cents', () => {
  const limit = Number.MAX_SAFE_INTEGER;
  const categories = ['a', 'b', 'c'].map((id) => ({ id, class: 'need' }));
  const budgetByMonth = new Map([
    [
      '2026-09',
      {
        envelopes: {
          a: { activityCents: -limit },
          b: { activityCents: -2 },
          c: { activityCents: limit },
        },
      },
    ],
  ]);
  expect(freedomExpenseMonths({ categories, budgetByMonth }, '2026-09')).toEqual([
    { month: '2026-09', consumptionCents: 2 },
  ]);
  const accounts = ['a', 'b', 'c'].map((id) => ({
    id,
    role: 'investment',
    openingDate: '2026-01-01',
  }));
  expect(freedomInvestedCents(accounts, today, { a: limit, b: 2, c: -limit })).toBe(2);
  expect(freedomInvestedCents(accounts, today, { a: limit, b: 2, c: 0 })).toBeNull();
});
