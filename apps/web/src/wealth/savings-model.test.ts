import { describe, expect, it } from 'vitest';
import type { SavingsPlanRecord } from './savings-api';
import { currentRates, planGroups, nextPlanExecution, planPurchases } from './savings-model';
const row = (
  id: string,
  from: string,
  to: string | null,
  amount: number,
  accountId = 'eur',
): SavingsPlanRecord => ({
  id,
  validFrom: from,
  validTo: to,
  amountCents: amount,
  accountId,
  securityId: 'fund',
  dayOfMonth: 31,
  sourceAccountId: 'giro',
  note: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  deletedAt: null,
});
describe('next savings execution', () => {
  it('sums recorded gross buys for this instrument/account since the first version only', () => {
    const buy = {
      id: 'purchase',
      kind: 'buy',
      date: '2026-02-01',
      securityId: 'fund',
      accountId: 'eur',
      amountCents: 10001,
    };
    const trades = [
      buy,
      { ...buy, id: 'second', amountCents: 20002 },
      { ...buy, kind: 'sell' },
      { ...buy, accountId: 'other' },
      { ...buy, date: '2025-12-31' },
      { ...buy, date: '2026-11-01' },
    ];
    expect(
      planPurchases([row('plan', '2026-01-01', null, 10000)], trades, '2026-10-01'),
    ).toMatchObject({
      totalCents: 30003,
      since: '2026-01-01',
      buys: [buy, { ...buy, id: 'second', amountCents: 20002 }],
    });
  });
  it('uses the version effective on execution day and clamps short months', () => {
    const plans = [
      row('old', '2026-01-01', '2026-10-30', 10000),
      row('new', '2026-10-31', null, 20000),
    ];
    expect(nextPlanExecution(plans, '2026-10-01')).toMatchObject({
      date: '2026-10-31',
      amountCents: 20000,
    });
    expect(nextPlanExecution(plans, '2027-02-01')?.date).toBe('2027-02-28');
    expect(
      nextPlanExecution([row('ended', '2026-01-01', '2026-09-30', 10000)], '2026-10-01'),
    ).toBeNull();
    expect(
      nextPlanExecution([...plans, row('overlap', '2026-10-01', null, 30000)], '2026-10-01'),
    ).toBeNull();
  });
});
describe('savings-plan presentation uses inclusive real versions', () => {
  const rows = [
    row('old', '2026-01-01', '2026-10-30', 10000),
    row('next', '2026-10-31', null, 20000),
  ];
  it('keeps future open version distinct from current rate', () => {
    const [group] = planGroups(rows, '2026-10-01');
    expect(group?.current?.amountCents).toBe(10000);
    expect(group?.editable?.id).toBe('next');
    expect(group?.future.map((r) => r.amountCents)).toEqual([20000]);
  });
  it('changes exactly at the inclusive boundary and retains history', () => {
    expect(planGroups(rows, '2026-10-30')[0]?.current?.id).toBe('old');
    expect(planGroups(rows, '2026-10-31')[0]?.current?.id).toBe('next');
    expect(planGroups(rows, '2026-10-31')[0]?.future).toEqual([]);
    expect(planGroups(rows, '2026-10-31')[0]?.rows.map((r) => r.id)).toEqual(['next', 'old']);
  });
  it('keeps separate account schedules and ended histories without inventing a current rate', () => {
    const groups = planGroups(
      [...rows, row('chf', '2026-01-01', '2026-09-30', 7500, 'chf')],
      '2026-10-01',
    );
    expect(groups).toHaveLength(2);
    expect(groups[1]?.current).toBeUndefined();
    expect(groups[1]?.editable).toBeUndefined();
    expect(groups[1]?.latest.id).toBe('chf');
  });
  it('totals EUR and CHF separately and never adds the future replacement', () => {
    const groups = planGroups([...rows, row('chf', '2026-01-01', null, 7500, 'chf')], '2026-10-01');
    expect([
      ...currentRates(groups, [
        { id: 'eur', currency: 'EUR' },
        { id: 'chf', currency: 'CHF' },
      ]),
    ]).toEqual([
      ['EUR', 10000],
      ['CHF', 7500],
    ]);
  });
  it('does not display an unsafe combined cent sum', () => {
    const groups = planGroups(
      [
        row('a', '2026-01-01', null, Number.MAX_SAFE_INTEGER),
        row('b', '2026-01-01', null, 1, 'other'),
      ],
      '2026-10-01',
    );
    expect(
      currentRates(groups, [
        { id: 'eur', currency: 'EUR' },
        { id: 'other', currency: 'EUR' },
      ]).get('EUR'),
    ).toBeNull();
  });
  it('preserves both overlapping current versions and makes the affected total unavailable', () => {
    const groups = planGroups(
      [row('finite', '2026-01-01', '2026-12-31', 10000), row('new', '2026-10-01', null, 20000)],
      '2026-10-01',
    );
    expect(groups[0]?.effective.map((r) => [r.id, r.amountCents])).toEqual([
      ['new', 20000],
      ['finite', 10000],
    ]);
    expect(groups[0]?.ambiguous).toBe(true);
    expect(groups[0]?.current).toBeUndefined();
    expect(currentRates(groups, [{ id: 'eur', currency: 'EUR' }]).get('EUR')).toBeNull();
  });
  it('keeps a missing-account rate visible and marks all potentially partial totals unavailable', () => {
    const groups = planGroups(
      [...rows, row('missing', '2026-01-01', null, 7500, 'missing-account')],
      '2026-10-01',
    );
    expect(groups[1]?.current?.amountCents).toBe(7500);
    expect([
      ...currentRates(groups, [
        { id: 'eur', currency: 'EUR' },
        { id: 'missing-account', currency: 'EUR' },
      ]),
    ]).toEqual([['EUR', 17500]]);
    expect([...currentRates(groups, [{ id: 'eur', currency: 'EUR' }])]).toEqual([
      ['EUR', null],
      ['Währung unbekannt', null],
    ]);
  });
});
