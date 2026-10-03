import { expect, it } from 'vitest';
import { moneyRuleViolation, settlementCents, unitsRuleViolation } from './trade-rules';
it.each([
  ['buy', 200000000, 10000, 100, 0, -10100],
  ['sell', -200000000, 15000, 100, 200, 14700],
  ['dividend', 0, 1000, 100, 200, 700],
  ['interest', 0, 500, 50, 50, 400],
  ['fee', 0, 100, 0, 0, -100],
  ['tax', 0, 200, 0, 0, -200],
  ['delivery_in', 200000000, 10000, 0, 0, 0],
  ['delivery_out', -200000000, 10000, 0, 0, 0],
  ['split', -100000000, 0, 0, 0, 0],
] as const)(
  '%s has literal units/cash effects',
  (kind, units, amountCents, feeCents, taxCents, cash) => {
    const money = { kind, amountCents, feeCents, taxCents };
    expect(unitsRuleViolation(kind, units)).toBeNull();
    expect(moneyRuleViolation(money)).toBeNull();
    expect(settlementCents(money)).toBe(cash);
  },
);
it('rejects nonzero split money and unsafe summed cents', () => {
  expect(
    moneyRuleViolation({ kind: 'split', amountCents: 100, feeCents: 0, taxCents: 0 }),
  ).not.toBeNull();
  expect(
    moneyRuleViolation({
      kind: 'buy',
      amountCents: Number.MAX_SAFE_INTEGER,
      feeCents: 1,
      taxCents: 0,
    }),
  ).not.toBeNull();
});
