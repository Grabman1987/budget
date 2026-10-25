import { describe, expect, it } from 'vitest';
import { assignmentSplits } from '../assignment-rules';
import {
  securityFlowCents,
  settlementCents,
  unitsHeld,
  valueAtPrice,
  type SeriesTrade,
} from '../invest';
import { balanceOn } from './balances';
import { budgetMonths, splitEffect, type BudgetInput } from './budget';
import { netWorthAttribution, netWorthSeries } from './networth';

const cardInput = (
  openingCard: number,
  food: number,
  reserve: number,
  expense: number,
  rolloverOverspending = false,
): BudgetInput => ({
  accounts: [
    { id: 'cash', onBudget: true, openingDate: '2026-08-01', openingBalanceCents: 100_000 },
    { id: 'card', onBudget: true, openingDate: '2026-08-01', openingBalanceCents: openingCard },
  ],
  categories: [
    { id: 'food', kind: 'variable', rolloverOverspending },
    { id: 'reserve', kind: 'card_payment', cardAccountId: 'card' },
  ],
  months: ['2026-09', '2026-10'],
  assigned: { '2026-09': { food, reserve } },
  splits: [{ accountId: 'card', date: '2026-09-15', amountCents: expense, categoryId: 'food' }],
});

describe('WP-001 remaining independent reference constants', () => {
  it.each([
    { food: 2_000, available: 0, reserve: 12_000, credit: 0, free: 88_000, cash: 88_000, debt: 0 },
    {
      food: 1_000,
      available: -1_000,
      reserve: 11_000,
      credit: 1_000,
      free: 89_000,
      cash: 89_000,
      debt: -1_000,
    },
  ])('CASE-003 funds $food cents, pays only the reserve and reverses both payment legs', (e) => {
    const input = cardInput(-10_000, e.food, 10_000, -2_000);
    const [september, october] = budgetMonths(input);
    expect(balanceOn(input.accounts[1]!, input.splits)).toBe(-12_000);
    expect(september).toMatchObject({ cashCents: 100_000, toBeAssignedCents: e.free });
    expect(september!.envelopes['food']).toMatchObject({
      availableCents: e.available,
      activityCents: -2_000,
      fundedCardCents: e.food,
      creditOverspentCents: e.credit,
      cashOverspentCents: 0,
    });
    expect(september!.envelopes['reserve']!.availableCents).toBe(e.reserve);
    expect(september!.cards['card']!.cardDebtGrowthCents).toBe(e.credit);
    expect(october).toMatchObject({ toBeAssignedCents: e.free, uncoveredCents: 0 });
    expect(october!.envelopes['food']!.availableCents).toBe(0);
    const payment = [
      {
        accountId: 'cash',
        date: '2026-09-20',
        amountCents: -e.reserve,
        categoryId: null,
        transferAccountId: 'card',
      },
      {
        accountId: 'card',
        date: '2026-09-20',
        amountCents: e.reserve,
        categoryId: null,
        transferAccountId: 'cash',
      },
    ];
    const paid = { ...input, splits: [...input.splits, ...payment] };
    const [paidMonth] = budgetMonths(paid);
    expect(balanceOn(paid.accounts[0]!, paid.splits)).toBe(e.cash);
    expect(balanceOn(paid.accounts[1]!, paid.splits)).toBe(e.debt);
    expect(paidMonth!.envelopes['reserve']!.availableCents).toBe(0);
    expect(paidMonth!.envelopes['food']!.activityCents).toBe(-2_000);
    expect(paidMonth!.toBeAssignedCents).toBe(e.free);
    // Pure replay removes both payment legs; actual grouped undo is tested at DB/API layers.
    expect(budgetMonths({ ...paid, splits: input.splits })).toEqual([september, october]);
  });

  it.each([
    { carry: false, reserve: 0, credit: 2_500, cashOverspent: 0, nextAvailable: 0 },
    { carry: true, reserve: 2_500, credit: 0, cashOverspent: 2_500, nextAvailable: -2_500 },
  ])('CASE-002 YNAB card carry=$carry never deducts a cash deficit as well', (e) => {
    const input = cardInput(0, 0, 0, -2_500, e.carry);
    const [september, october] = budgetMonths(input);
    expect(balanceOn(input.accounts[1]!, input.splits)).toBe(-2_500);
    expect(september).toMatchObject({
      cashCents: 100_000,
      toBeAssignedCents: 100_000,
      creditOverspentCents: e.credit,
    });
    expect(september!.envelopes['food']).toMatchObject({
      availableCents: -2_500,
      cashOverspentCents: e.cashOverspent,
      creditOverspentCents: e.credit,
    });
    expect(september!.envelopes['reserve']!.availableCents).toBe(e.reserve);
    expect(october).toMatchObject({
      cashCents: 100_000,
      toBeAssignedCents: 100_000,
      uncoveredCents: 0,
      creditOverspentCents: 0,
    });
    expect(october!.envelopes['food']).toMatchObject({
      assignedCents: 0,
      activityCents: 0,
      availableCents: e.nextAvailable,
    });
  });

  it.each([
    { amount: 1_000, cents: [334, 333, 333] },
    { amount: -1_000, cents: [-334, -333, -333] },
  ])(
    'CASE-004 ordered thirds conserve $amount cents with the opposite reversal',
    ({ amount, cents }) => {
      // The existing API stores basis points: quantized thirds, never invalid 3 × 3333.
      const template = [
        { categoryId: 'a', weightBp: 3334 },
        { categoryId: 'b', weightBp: 3333 },
        { categoryId: 'c', weightBp: 3333 },
      ];
      expect(assignmentSplits(amount, template)).toEqual([
        { categoryId: 'a', amountCents: cents[0] },
        { categoryId: 'b', amountCents: cents[1] },
        { categoryId: 'c', amountCents: cents[2] },
      ]);
      expect(
        assignmentSplits(amount, template).reduce((sum, row) => sum + row.amountCents, 0),
      ).toBe(amount);
    },
  );

  it('CASE-005 internal transfer is neutral; the same A-only boundary loses 20,000 cents', () => {
    const accounts = [
      { id: 'a', onBudget: true, openingDate: '2026-08-01', openingBalanceCents: 100_000 },
      { id: 'b', onBudget: true, openingDate: '2026-08-01', openingBalanceCents: 25_000 },
    ];
    const splits = [
      {
        accountId: 'a',
        date: '2026-09-15',
        amountCents: -20_000,
        categoryId: null,
        transferAccountId: 'b',
      },
      {
        accountId: 'b',
        date: '2026-09-15',
        amountCents: 20_000,
        categoryId: null,
        transferAccountId: 'a',
      },
    ];
    const input = { accounts, splits, months: ['2026-09'], categories: [] };
    expect(balanceOn(accounts[0]!, splits)).toBe(80_000);
    expect(balanceOn(accounts[1]!, splits)).toBe(45_000);
    const total = budgetMonths(input)[0]!;
    expect(total).toMatchObject({
      cashCents: 125_000,
      incomeCents: 0,
      availableCents: 0,
      toBeAssignedCents: 125_000,
    });
    expect(
      splits.map((row) =>
        splitEffect(
          row,
          new Map([
            ['a', true],
            ['b', true],
          ]),
          new Set<string>(),
        ),
      ),
    ).toEqual([{ kind: 'neutral' }, { kind: 'neutral' }]);
    expect(budgetMonths({ ...input, accounts: [accounts[0]!] })[0]).toMatchObject({
      cashCents: 80_000,
      incomeCents: -20_000,
    });
    expect(
      netWorthAttribution({
        previousCents: 125_000,
        currentCents: total.cashCents,
        marketMoveCents: 0,
      }),
    ).toEqual({ changeCents: 0, ownCents: 0, marketCents: 0 });
  });

  it('CASE-006 purchase fee leaves 9,800 cash, ten units and 19,800 total wealth', () => {
    const trade: SeriesTrade = {
      date: '2026-09-15',
      kind: 'buy',
      unitsE8: 1_000_000_000,
      amountCents: 10_000,
      feeCents: 200,
      taxCents: 0,
    };
    const units = unitsHeld(undefined, [trade], '2026-09-30');
    expect(units).toBe(1_000_000_000);
    const value = valueAtPrice(
      units,
      { price: { date: '2026-09-15', priceMicro: 10_000_000, currency: 'EUR' }, quality: 'exact' },
      1_000_000,
    );
    expect(value).toBe(10_000);
    const settlement = settlementCents(trade);
    expect(settlement).toBe(-10_200);
    const cash = balanceOn(
      { id: 'depot', openingDate: '2026-08-01', openingBalanceCents: 20_000 },
      [{ accountId: 'depot', date: '2026-09-15', amountCents: settlement }],
    );
    expect(cash).toBe(9_800);
    expect(
      netWorthSeries({
        dates: ['2026-09-30'],
        balancesAt: () => new Map([['cash', cash]]),
        investmentValueAt: () => value,
      }),
    ).toEqual([{ date: '2026-09-30', netWorthCents: 19_800 }]);
    expect(securityFlowCents(trade)).toBe(10_200);
  });

  it('CASE-007 names after-tax facts separately from the PP before-tax return withdrawal', () => {
    const dividend: SeriesTrade = {
      date: '2026-09-15',
      kind: 'dividend',
      unitsE8: 0,
      amountCents: 1_000,
      feeCents: 100,
      taxCents: 200,
    };
    expect(securityFlowCents(dividend, 'after-tax')).toBe(-700);
    expect(securityFlowCents(dividend, 'before-tax')).toBe(-900);
    expect(securityFlowCents(dividend, 'pp-irr')).toBe(-900);
    // Exact 700-cent settlement is reused from invest/trade-rules.test.ts, not reimplemented here.
    expect(
      unitsHeld({ asOf: '2026-08-01', unitsE8: 1_000_000_000 }, [dividend], '2026-09-30'),
    ).toBe(1_000_000_000);
  });
});
