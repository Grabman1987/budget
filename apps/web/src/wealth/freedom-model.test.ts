import { describe, expect, it } from 'vitest';
import { addMonths } from '@budget/domain';
import { freedomScenario } from './freedom-model';
import type { FreedomView } from './freedom-api';
const view: FreedomView = {
  asOf: '2026-10-01',
  refMonth: '2026-09',
  months: Array.from({ length: 12 }, (_, i) => ({
    month: addMonths('2025-10', i),
    consumptionCents: i === 11 ? 4000 : 0,
  })),
  annualSpendCents: 4_000,
  multiple: 25,
  targetCents: 100_000,
  investedCents: 0,
  progressBp: 0,
  defaultRealReturnBp: 500,
  accounts: [],
  expensesUnsafe: false,
};
describe('explicit freedom scenario', () => {
  it('has no inferred saving; arithmetic uses the shared parser and projection', () => {
    expect(freedomScenario(view, '', 500)).toEqual({ projection: null, error: '' });
    expect(freedomScenario(view, '50+50', 0).projection).toMatchObject({
      months: 10,
      monthsWithExtra: 5,
      monthsEarlier: 5,
      doneMonth: '2027-08',
    });
  });
  it('unreachable, already reached and missing valuation remain explicit', () => {
    expect(freedomScenario(view, '0', 0).projection).toMatchObject({
      months: null,
      doneMonth: null,
      monthsEarlier: null,
      monthsWithExtra: 10,
    });
    expect(freedomScenario({ ...view, investedCents: 100_000 }, '0', 0).projection?.months).toBe(0);
    expect(freedomScenario({ ...view, investedCents: null }, '100', 500)).toEqual({
      projection: null,
      error: '',
    });
    expect(freedomScenario({ ...view, targetCents: 0 }, '100', 500).projection).toBeNull();
  });
  it('rejects negative, malformed and unsafe source amounts with a corrective path', () => {
    for (const saving of ['-1', 'oops', '99999999999999999999999', '90071992547409,91']) {
      expect(freedomScenario(view, saving, 500).projection, saving).toBeNull();
      expect(freedomScenario(view, saving, 500).error, saving).not.toBe('');
    }
    expect(freedomScenario(view, '100', Number.NaN).error).toContain('Rechenbereich');
  });
});
