import { expect, it } from 'vitest';
import { spendingChangeChain } from './spending-analysis-report';

const base = (previous: number | null, rows: [string, number, number | null][]) =>
  ({
    consumptionCents: rows.reduce((a, r) => a + r[1], 0),
    breakdown: rows.filter((r) => r[1] !== 0).map(([id, cents]) => ({ id, cents })),
    answerComparison: {
      previousCents: previous,
      rows: rows.map(([id, , prior]) => ({ id, previousCents: prior })),
    },
  }) as unknown as Parameters<typeof spendingChangeChain>[0];

it('splits the change into more and less so that before + more - less = now to the cent', () => {
  const chain = spendingChangeChain(
    base(1000, [
      ['a', 700, 400],
      ['b', 100, 300],
      ['c', 0, 300],
    ]),
  );
  expect(chain).toEqual({ before: 1000, more: 300, less: 500, now: 800 });
});

it('shows no chain without a comparison period or when the parts do not add up', () => {
  expect(spendingChangeChain(base(null, [['a', 100, null]]))).toBeNull();
  expect(spendingChangeChain(base(999, [['a', 100, 1000]]))).toBeNull();
});
