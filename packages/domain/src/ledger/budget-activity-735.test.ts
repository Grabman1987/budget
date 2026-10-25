import { expect, it } from 'vitest';
import { budgetActivity, budgetMonths, type BudgetInput, type LedgerSplit } from './budget';

const accounts = [
  { id: 'cash', onBudget: true, openingDate: '2026-10-01', openingBalanceCents: 100_000 },
  { id: 'card', onBudget: true, openingDate: '2026-10-01', openingBalanceCents: 0 },
  { id: 'tracking', onBudget: false, openingDate: '2026-10-01', openingBalanceCents: 0 },
];
const categories = [
  { id: 'food', kind: 'variable' },
  { id: 'other', kind: 'variable' },
  { id: 'reserve', kind: 'card_payment', cardAccountId: 'card' },
];
const split = (id: string, amountCents: number, extra: Partial<LedgerSplit> = {}): LedgerSplit => ({
  splitId: id,
  bookingId: `booking-${id}`,
  accountId: 'cash',
  date: '2026-10-20',
  categoryId: 'food',
  amountCents,
  status: 'pending',
  ...extra,
});
function trace(splits: LedgerSplit[], categoryId = 'food', extra: Partial<BudgetInput> = {}) {
  const input: BudgetInput = {
    accounts,
    categories,
    months: ['2026-10', '2026-11'],
    splits,
    ...extra,
  };
  const result = budgetActivity(input, '2026-10', categoryId);
  expect(result.months).toEqual(budgetMonths(input));
  expect(result.items.reduce((sum, item) => sum + item.cents, 0)).toBe(
    result.months[0]!.envelopes[categoryId]!.activityCents,
  );
  return result;
}

it('keeps exact split portions, signed refunds and all live booking statuses', () => {
  const result = trace([
    split('purchase', -10_001),
    split('other', -2_344, { categoryId: 'other' }),
    split('refund', 1_234, { status: 'confirmed' }),
    split('cleared', -100, { status: 'reconciled' }),
  ]);
  expect(result.items.map((item) => [item.splitId, item.cents])).toEqual([
    ['purchase', -10_001],
    ['refund', 1_234],
    ['cleared', -100],
  ]);
  expect(result.months[0]!.envelopes.food!.activityCents).toBe(-8_867);
});
it('uses the same opening, live category, budget account, month and transfer rules', () => {
  const result = trace([
    split('early', -900, { date: '2026-09-30' }),
    split('next', -800, { date: '2026-11-01' }),
    split('tracking', -777, { accountId: 'tracking' }),
    split('deleted-account', -666, { accountId: 'gone' }),
    split('deleted-category', -555, { categoryId: 'gone' }),
    split('internal', -444, { transferAccountId: 'card' }),
    split('external', -2_000, { transferAccountId: 'tracking' }),
  ]);
  expect(result.items.map((item) => [item.splitId, item.cents])).toEqual([['external', -2_000]]);
});
it('distinguishes no activity from two real terms that cancel to zero', () => {
  expect(trace([]).items).toEqual([]);
  expect(trace([split('out', -500), split('back', 500)]).items).toHaveLength(2);
});
it('labels the exact monthly unfunded subtraction instead of inventing a source booking', () => {
  const result = trace(
    [
      split('spend', -10_000, { accountId: 'card' }),
      split('payment', 2_000, { accountId: 'card', categoryId: null, transferAccountId: 'cash' }),
    ],
    'reserve',
    { assigned: { '2026-10': { food: 6_000 } } },
  );
  expect(result.items.map((item) => [item.kind, item.cents, item.bookingId])).toEqual([
    ['card-reserve', 10_000, 'booking-spend'],
    ['card-reserve', -2_000, 'booking-payment'],
    ['unfunded-card', -4_000, null],
  ]);
  expect(result.months[0]!.envelopes.reserve!.activityCents).toBe(4_000);
  expect(result.items[2]!.relatedCategories).toEqual([{ categoryId: 'food', cents: -4_000 }]);
});
it('late cover, refunds, positive card balances, rollover and concept retain the canonical terms', () => {
  const spending = [
    split('spend', -10_000, { accountId: 'card' }),
    split('refund', 1_000, { accountId: 'card' }),
  ];
  expect(
    trace(spending, 'reserve', { assigned: { '2026-10': { food: 10_000 } } }).items.map(
      (i) => i.cents,
    ),
  ).toEqual([10_000, -1_000]);
  expect(trace(spending, 'reserve', { cardRule: 'concept' }).items.map((i) => i.cents)).toEqual([
    10_000, -1_000,
  ]);
  expect(
    trace(spending, 'reserve', {
      categories: categories.map((c) => ({ ...c, rolloverOverspending: true })),
    }).items.map((i) => i.cents),
  ).toEqual([10_000, -1_000]);
  const positiveBalance = trace([spending[0]!], 'reserve', {
    accounts: accounts.map((a) => (a.id === 'card' ? { ...a, openingBalanceCents: 3_000 } : a)),
    assigned: { '2026-10': { food: 10_000 } },
  });
  expect(positiveBalance.items.map((i) => i.cents)).toEqual([7_000]);
  expect(positiveBalance.items[0]).toMatchObject({
    sourceCategoryId: 'food',
    sourceAmountCents: -10_000,
    cardBalanceCoveredCents: -3_000,
  });
});
it('preserves same-day source order and multi-card funding rather than sorting the kernel inputs', () => {
  const input: BudgetInput = {
    accounts: [...accounts, { ...accounts[1]!, id: 'card2' }],
    categories: [...categories, { id: 'reserve2', kind: 'card_payment', cardAccountId: 'card2' }],
    months: ['2026-10'],
    assigned: { '2026-10': { food: 6_000 } },
    splits: [
      split('first', -5_000, { accountId: 'card' }),
      split('second', -5_000, { accountId: 'card2' }),
    ],
  };
  const first = budgetActivity(input, '2026-10', 'reserve');
  const second = budgetActivity(input, '2026-10', 'reserve2');
  expect(first.months).toEqual(budgetMonths(input));
  expect(first.items.map((i) => i.cents)).toEqual([5_000]);
  expect(second.items.map((i) => i.cents)).toEqual([5_000, -4_000]);
});
