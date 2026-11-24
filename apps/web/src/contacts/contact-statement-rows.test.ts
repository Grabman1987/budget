import { expect, it } from 'vitest';
import type { ContactMovement } from '@budget/domain';
import {
  currentStretchStart,
  giftInfo,
  groupByMonth,
  GIFT_MEMO,
  runningBalances,
} from './contact-statement-rows';

const move = (splitId: string, date: string, amountCents: number, memo: string | null = null) =>
  ({ splitId, bookingId: `b-${splitId}`, date, amountCents, memo }) as ContactMovement;

const movements = [
  move('o1', '2026-08-03', -1000),
  move('r1', '2026-08-20', 1000),
  move('o2', '2026-09-02', -2100),
  move('o3', '2026-10-05', -500),
  move('g1', '2026-10-06', 500, GIFT_MEMO),
];

it('derives balances per month end and the current stretch after the last zero', () => {
  const { after, monthEnd } = runningBalances(movements);
  expect(after.get('r1')).toBe(0);
  expect(monthEnd.get('2026-09')).toBe(2100);
  expect(monthEnd.get('2026-10')).toBe(2100);
  expect(currentStretchStart(movements, new Set(['o2', 'o3']))).toBe(2);
  expect(currentStretchStart(movements.slice(0, 2), new Set())).toBe(2);
});

it('groups rows by month with the end balance of the full statement', () => {
  const { monthEnd } = runningBalances(movements);
  const groups = groupByMonth(movements.slice(2), monthEnd);
  expect(groups.map((g) => [g.title, g.rows.length, g.endBalanceCents])).toEqual([
    ['September 2026', 1, 2100],
    ['Oktober 2026', 2, 2100],
  ]);
});

it('recognises gift receipts and gifted outlays', () => {
  const { giftReceiptIds, giftedByOutlay } = giftInfo({
    movements,
    receipts: [
      { receiptSplitId: 'r1', allocations: [{ outlaySplitId: 'o1', amountCents: 1000 }] },
      { receiptSplitId: 'g1', allocations: [{ outlaySplitId: 'o3', amountCents: 500 }] },
    ],
  });
  expect([...giftReceiptIds]).toEqual(['g1']);
  expect(giftedByOutlay.get('o3')).toBe(500);
  expect(giftedByOutlay.has('o1')).toBe(false);
});
