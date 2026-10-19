import { expect, it } from 'vitest';
import { evaluateFreedomRule } from './evaluate';

it('the narrow R16 preview retains default and configured multiples and unavailable inputs', () => {
  const freedom = { investedCents: 25000, annualSpendCents: 1200, previousProgressBp: null };
  expect(evaluateFreedomRule({}, freedom)).toMatchObject({
    status: 'ok',
    valueText: '83,3 %',
    detail: { progressBp: 8333, targetCents: 30000 },
  });
  expect(evaluateFreedomRule({ multiple: 20 }, freedom)).toMatchObject({
    status: 'ok',
    valueText: '104,2 %',
    detail: { progressBp: 10417, targetCents: 24000 },
  });
  expect(evaluateFreedomRule({}, { ...freedom, previousProgressBp: 9000 })?.status).toBe('warn');
  expect(evaluateFreedomRule({}, null)).toBeNull();
});
