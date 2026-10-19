import { describe, expect, it } from 'vitest';
import { requiredMonthlySavingCents, valueAfterMonths } from './freedom';
import {
  freedomGoalAge,
  freedomGoalDocument,
  freedomGoalMonths,
  freedomGoalRate,
  freedomGoalYearFromAge,
} from './freedom-goal';

describe('personal freedom goal compatibility and exact rate (#617)', () => {
  it('accepts only the supported complete setting and never partially reads future or malformed data', () => {
    expect(freedomGoalDocument({ schemaVersion: 1, goalYear: null })).toEqual({
      schemaVersion: 1,
      goalYear: null,
    });
    expect(freedomGoalDocument({ schemaVersion: 1, goalYear: 2050 })).toEqual({
      schemaVersion: 1,
      goalYear: 2050,
    });
    for (const value of [
      null,
      [],
      {},
      { schemaVersion: 2, goalYear: 2050 },
      { schemaVersion: 1, goalYear: '2050' },
      { schemaVersion: 1, goalYear: 2050, extra: true },
      { schemaVersion: 1, goalYear: 2050.5 },
    ])
      expect(freedomGoalDocument(value)).toBeNull();
  });

  it('preserves January and the independently established monthly-rounded 129176-cent annuity', () => {
    // The established synthetic example uses315 end-of-month deposits, monthly5%/12 interest
    // rounded to cents. The unrounded closed-form129175 is deliberately not the contract.
    expect(freedomGoalMonths(2050, '2023-10-19')).toBe(315);
    expect(
      freedomGoalRate({
        goalYear: 2050,
        asOf: '2023-10-19',
        investedCents: 4_083_100,
        targetCents: 99_000_000,
        realReturnBp: 500,
      }),
    ).toEqual({ status: 'available', months: 315, monthlySavingCents: 129_176 });
    // Independent division: 3*333=999<1000, while3*334=1002 reaches the target.
    expect(
      freedomGoalRate({
        goalYear: 2027,
        asOf: '2026-10-19',
        investedCents: 0,
        targetCents: 1000,
        realReturnBp: 0,
      }),
    ).toEqual({ status: 'available', months: 3, monthlySavingCents: 334 });
  });

  it('retains unset, actual zero, missed, missing and unsafe states without fabricated money', () => {
    const base = {
      asOf: '2026-10-19',
      goalYear: 2027,
      investedCents: 0,
      targetCents: 1000,
      realReturnBp: 0,
    };
    expect(freedomGoalRate({ ...base, goalYear: null }).status).toBe('unset');
    expect(freedomGoalRate({ ...base, investedCents: 1000 })).toEqual({
      status: 'available',
      months: 3,
      monthlySavingCents: 0,
    });
    expect(freedomGoalRate({ ...base, goalYear: 2026 })).toEqual({
      status: 'missed',
      months: 0,
      monthlySavingCents: null,
    });
    expect(
      freedomGoalRate({ ...base, goalYear: 2026, investedCents: 1000 }).monthlySavingCents,
    ).toBe(0);
    for (const change of [
      { investedCents: null },
      { targetCents: null },
      { targetCents: 0 },
      { targetCents: -1000 },
      { goalYear: 2090 },
      { realReturnBp: 601 },
      {
        investedCents: Number.MAX_SAFE_INTEGER,
        targetCents: Number.MAX_SAFE_INTEGER,
        realReturnBp: 500,
      },
      { investedCents: -Number.MAX_SAFE_INTEGER, targetCents: Number.MAX_SAFE_INTEGER },
    ]) {
      expect(freedomGoalRate({ ...base, ...change })).toMatchObject({
        status: 'unavailable',
        monthlySavingCents: null,
      });
    }
  });

  it('maps a real full synthetic DOB to calendar-year age, never to a made-up birthday deadline', () => {
    for (const today of ['2026-06-14', '2026-06-15', '2026-06-16']) {
      expect(freedomGoalYearFromAge('1980-06-15', 70, today)).toBe(2050);
      expect(freedomGoalAge('1980-06-15', 2050, today)).toBe(70);
    }
    expect(freedomGoalYearFromAge('2000-02-29', 50, '2026-02-28')).toBe(2050);
    for (const value of ['', '1980-06', '1980-02-30', '2030-01-01']) {
      expect(freedomGoalYearFromAge(value, 70, '2026-10-19')).toBeNull();
      expect(freedomGoalAge(value, 2050, '2026-10-19')).toBeNull();
    }
    expect(freedomGoalYearFromAge('1980-06-15', 70.1, '2026-10-19')).toBeNull();
  });

  it('does not publish the existing search upper bound when negative capital cannot reach the deadline', () => {
    // One month: -100000 capital incurs -417 interest; a101000 payment leaves583, not1000.
    // This slice preserves the shared search and reports unavailable instead of inventing a rate.
    expect(
      requiredMonthlySavingCents({
        startCents: -100000,
        months: 1,
        realReturnBp: 500,
        targetCents: 1000,
      }),
    ).toBe(101000);
    expect(valueAfterMonths(-100000, 1, 500, 101000)).toBe(583);
    expect(
      freedomGoalRate({
        goalYear: 2026,
        asOf: '2025-12-19',
        investedCents: -100000,
        targetCents: 1000,
        realReturnBp: 500,
      }),
    ).toMatchObject({ status: 'unavailable', monthlySavingCents: null });
  });
});
