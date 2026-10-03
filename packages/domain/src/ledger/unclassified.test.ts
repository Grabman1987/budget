import { expect, it } from 'vitest';
import { unclassifiedMonth } from './unclassified';

it('counts the union once, including pending categorized money and excluding transfers', () => {
  const accounts = [
    { id: 'cash', onBudget: true, openingDate: '2026-01-01', openingBalanceCents: 0 },
  ];
  const base = { accountId: 'cash', date: '2026-10-03', categoryId: null, status: 'pending' };
  const result = unclassifiedMonth(
    {
      accounts,
      splits: [
        { ...base, bookingId: 'a', amountCents: 1000 },
        { ...base, bookingId: 'b', amountCents: -300, categoryId: 'food' },
        { ...base, bookingId: 'b', amountCents: -200 },
        { ...base, bookingId: 'c', amountCents: -700, status: 'confirmed', categoryId: 'food' },
        { ...base, amountCents: 900, transferAccountId: 'other' },
        { ...base, amountCents: 800, accountId: 'tracking' },
        { ...base, amountCents: 600, date: '2026-09-03' },
      ],
    },
    '2026-10',
  );
  expect(result).toEqual({ count: 2, inflowCents: 1000, outflowCents: 500, netCents: 500 });
});
