import { expect, it } from 'vitest';
import { budgetAccountMoney, coverAvailability, coverPlan, coverShortfall } from './cover';

it('reserves future pending spending and only unbooked recurring dues through payday', () => {
  const result = coverAvailability(
    [{ categoryId: 'health', availableCents: 9500 }],
    [
      { categoryId: 'health', date: '2026-10-09', amountCents: -3000, status: 'pending' },
      { categoryId: 'health', date: '2026-11-04', amountCents: -1000, status: 'pending' },
      { categoryId: 'health', date: '2026-11-16', amountCents: -1000, status: 'pending' },
      { categoryId: 'health', date: '2026-10-20', amountCents: -1000, status: 'confirmed' },
      { categoryId: 'health', date: '2026-10-19', amountCents: -1000, status: 'pending' },
    ],
    [
      { categoryId: 'health', dueDate: '2026-10-20', amountCents: -2000, booked: false },
      { categoryId: 'health', dueDate: '2026-11-13', amountCents: -1500, booked: false },
      { categoryId: 'health', dueDate: '2026-11-14', amountCents: -4000, booked: false },
      { categoryId: 'health', dueDate: '2026-10-22', amountCents: -3500, booked: true },
    ],
    '2026-10',
    '2026-10-19',
    '2026-11-13',
  );
  expect(result).toEqual([{ categoryId: 'health', committedCents: 4500, freeCents: 5000 }]);
  expect(
    coverAvailability(
      [{ categoryId: 'health', availableCents: 1000 }],
      [],
      [{ categoryId: 'health', dueDate: '2026-10-20', amountCents: -2000, booked: false }],
      '2026-10',
      '2026-10-19',
      '2026-11-13',
    )[0]?.freeCents,
  ).toBe(0);
});

it('shows missing money only beyond all free sources, including unassigned money', () => {
  expect(coverShortfall(6000, [2500, 2000], 1500)).toBe(0);
  expect(coverShortfall(6001, [2500, 2000], 1500)).toBe(1);
  expect(coverShortfall(6000, [2500, 2000], -1000)).toBe(1500);
});

it.each([null, 5000])('shows used credit independently of its stored limit %s', (limit) => {
  expect(
    budgetAccountMoney([
      { id: 'cash', name: 'Testcash', balanceCents: 8000, onBudget: true },
      {
        id: 'bank',
        name: 'Testgiro',
        balanceCents: -3000,
        onBudget: true,
        overdraftLimitCents: limit,
      },
      { id: 'outside', name: 'Testrücklage', balanceCents: 9000, onBudget: false },
    ]),
  ).toMatchObject({
    totalCents: 5000,
    usedCreditCents: 3000,
    accounts: [
      { id: 'cash', balanceCents: 8000, usedCreditCents: 0, creditLineCents: null },
      { id: 'bank', balanceCents: -3000, usedCreditCents: 3000, creditLineCents: limit },
    ],
  });
  expect(
    budgetAccountMoney([
      {
        id: 'card',
        name: 'Testkarte',
        balanceCents: -2000,
        onBudget: true,
        creditLimitCents: 4000,
      },
    ]).accounts[0]?.creditLineCents,
  ).toBe(4000);
});

it('uses largest sources in order, partially covers the next target and stops at zero', () => {
  const targets = [
    { id: 'a', overspentCents: 1200 },
    { id: 'b', overspentCents: 2000 },
    { id: 'c', overspentCents: 300 },
  ];
  const sources = [
    { id: 'small', availableCents: 500 },
    { id: 'large', availableCents: 2000 },
  ];
  expect(coverPlan(targets, sources)).toEqual({
    moves: [
      { fromId: 'large', toId: 'a', amountCents: 1200 },
      { fromId: 'large', toId: 'b', amountCents: 800 },
      { fromId: 'small', toId: 'b', amountCents: 500 },
    ],
    coveredCount: 1,
    openCount: 2,
    missingCents: 1000,
  });
  expect(sources[1]!.availableCents).toBe(2000);
  expect(coverPlan(targets, [{ id: null, availableCents: 3500 }])).toMatchObject({
    coveredCount: 3,
    openCount: 0,
    missingCents: 0,
  });
});

it('caps free money and shortfall at balances plus allowed overdraft', () => {
  const money = budgetAccountMoney([
    {
      id: 'bank',
      name: 'Testgiro',
      balanceCents: -3000,
      onBudget: true,
      overdraftLimitCents: 5000,
    },
  ]);
  expect(money.coverCapCents).toBe(2000);
  expect(coverShortfall(4000, [4000], 0, money.coverCapCents)).toBe(2000);
  expect(
    coverAvailability(
      [{ categoryId: 'a', availableCents: 4000 }],
      [],
      [],
      '2026-10',
      '2026-10-05',
      '2026-10-15',
      money.coverCapCents,
    )[0]?.freeCents,
  ).toBe(2000);
});
