import { describe, expect, it } from 'vitest';
import {
  executionDate,
  matchExecutions,
  nextExecutionAfter,
  planChanges,
  plannedExecutions,
  type ExecutedBuy,
  type PlanRow,
} from './savings-plan';

const row = (over: Partial<PlanRow> = {}): PlanRow => ({
  id: 'p1',
  securityId: 's1',
  accountId: 'a1',
  amountCents: 30_000,
  dayOfMonth: 15,
  validFrom: '2026-01-01',
  validTo: null,
  ...over,
});
const buy = (over: Partial<ExecutedBuy> = {}): ExecutedBuy => ({
  id: 't1',
  securityId: 's1',
  accountId: 'a1',
  date: '2026-03-15',
  amountCents: 30_000,
  feeCents: 0,
  ...over,
});

describe('executionDate', () => {
  it('clamps to the last day of short months and leap years', () => {
    expect(executionDate('2026-02', 31)).toBe('2026-02-28');
    expect(executionDate('2028-02', 30)).toBe('2028-02-29');
    expect(executionDate('2026-04', 31)).toBe('2026-04-30');
    expect(executionDate('2026-03', 5)).toBe('2026-03-05');
    expect(() => executionDate('2026-03', 0)).toThrow(RangeError);
  });
});

describe('plannedExecutions', () => {
  it('uses the row that applies on the execution day, so a change from a later day waits', () => {
    const plans = [
      row({ id: 'old', amountCents: 30_000, validTo: '2026-03-14' }),
      row({ id: 'new', amountCents: 10_000, validFrom: '2026-03-15' }),
    ];
    // Row `old` ended the day before the 15th, `new` starts on it.
    expect(plannedExecutions(plans, '2026-03').map((e) => [e.planId, e.amountCents])).toEqual([
      ['new', 10_000],
    ]);
    expect(plannedExecutions(plans, '2026-02').map((e) => e.planId)).toEqual(['old']);
  });

  it('skips months before the start and after the end, and orders by day', () => {
    const plans = [
      row({ id: 'b', dayOfMonth: 20, validFrom: '2026-02-10' }),
      row({ id: 'a', dayOfMonth: 5, validFrom: '2026-01-01', validTo: '2026-02-28' }),
    ];
    expect(plannedExecutions(plans, '2026-01').map((e) => e.planId)).toEqual(['a']);
    expect(plannedExecutions(plans, '2026-02').map((e) => e.planId)).toEqual(['a', 'b']);
    expect(plannedExecutions(plans, '2026-03').map((e) => e.planId)).toEqual(['b']);
  });
});

describe('nextExecutionAfter', () => {
  it('is strictly after today, also across year ends and short months', () => {
    expect(nextExecutionAfter(15, '2026-09-14')).toBe('2026-09-15');
    expect(nextExecutionAfter(15, '2026-09-15')).toBe('2026-10-15');
    expect(nextExecutionAfter(31, '2026-12-31')).toBe('2027-01-31');
    expect(nextExecutionAfter(31, '2027-01-31')).toBe('2027-02-28');
  });
});

describe('matchExecutions', () => {
  const planned = plannedExecutions([row()], '2026-03');

  it('matches a buy within three days and flags amounts that do not fit', () => {
    expect(matchExecutions(planned, [buy({ date: '2026-03-18' })], '2026-03-31')[0]).toMatchObject({
      status: 'executed',
      tradeId: 't1',
    });
    expect(matchExecutions(planned, [buy({ date: '2026-03-19' })], '2026-03-31')[0]?.status).toBe(
      'missing',
    );
    expect(matchExecutions(planned, [buy({ amountCents: 25_000 })], '2026-03-31')[0]?.status).toBe(
      'missing',
    );
  });

  it('accepts the fee inside or on top of the planned amount', () => {
    // 295,00 € bought + 5,00 € fee debits 300,00 €; 300,00 € bought with a 5,00 € fee elsewhere.
    expect(
      matchExecutions(planned, [buy({ amountCents: 29_500, feeCents: 500 })], '2026-03-31')[0]
        ?.status,
    ).toBe('executed');
    expect(
      matchExecutions(planned, [buy({ amountCents: 30_000, feeCents: 500 })], '2026-03-31')[0]
        ?.status,
    ).toBe('executed');
  });

  it('is upcoming until the window has passed; another security or account does not count', () => {
    expect(matchExecutions(planned, [], '2026-03-18')[0]?.status).toBe('upcoming');
    expect(matchExecutions(planned, [], '2026-03-19')[0]?.status).toBe('missing');
    expect(matchExecutions(planned, [buy({ securityId: 'other' })], '2026-03-31')[0]?.status).toBe(
      'missing',
    );
    expect(matchExecutions(planned, [buy({ accountId: 'other' })], '2026-03-31')[0]?.status).toBe(
      'missing',
    );
  });

  it('one buy fulfils one execution (nearest day wins)', () => {
    const two = plannedExecutions(
      [row({ id: 'p1', dayOfMonth: 14 }), row({ id: 'p2', dayOfMonth: 16 })],
      '2026-03',
    );
    const result = matchExecutions(two, [buy({ date: '2026-03-16' })], '2026-03-31');
    expect(result.map((r) => [r.planId, r.status])).toEqual([
      ['p1', 'missing'],
      ['p2', 'executed'],
    ]);
  });
});

describe('planChanges', () => {
  it('keeps only changed rates, from the next execution day', () => {
    const rows = [row({ id: 'p1' }), row({ id: 'p2', securityId: 's2', amountCents: 6_000 })];
    expect(
      planChanges(
        rows,
        [
          { id: 'p1', proposedCents: 30_000 },
          { id: 'p2', proposedCents: 10_000 },
        ],
        '2026-09-17',
      ),
    ).toEqual([
      {
        planId: 'p2',
        securityId: 's2',
        accountId: 'a1',
        fromCents: 6_000,
        toCents: 10_000,
        from: '2026-10-15',
      },
    ]);
    expect(() => planChanges(rows, [{ id: 'p1', proposedCents: -1 }], '2026-09-17')).toThrow(
      RangeError,
    );
  });
});
