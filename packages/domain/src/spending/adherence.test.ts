import { describe, expect, it } from 'vitest';
import { adherenceMonth, planDeviation, type AdherenceInput } from './adherence';

const row = (patch: Partial<AdherenceInput> & { id: string }): AdherenceInput => ({
  name: patch.id,
  groupName: 'Alltag',
  class: 'need',
  kind: 'variable',
  assignedCents: 0,
  carryCents: 0,
  spendCents: 0,
  ...patch,
});

describe('adherenceMonth', () => {
  const month = adherenceMonth([
    row({ id: 'food', assignedCents: 50_000, spendCents: 52_000 }),
    row({ id: 'rent', groupName: 'Wohnen', assignedCents: 80_000, spendCents: 80_000 }),
    // Periodic: the yearly bill is paid from the reserve of earlier months.
    row({
      id: 'car',
      kind: 'periodic',
      assignedCents: 5_000,
      carryCents: 55_000,
      spendCents: 58_000,
    }),
    row({
      id: 'trip',
      class: 'want',
      kind: 'periodic',
      assignedCents: 4_000,
      carryCents: 0,
      spendCents: 9_000,
    }),
    row({ id: 'unused' }),
    row({ id: 'refund', assignedCents: 0, spendCents: -500 }),
  ]);
  it('compares assigned money with spending and counts what is over', () => {
    const by = Object.fromEntries(month.items.map((x) => [x.id, x]));
    expect(by['food']).toMatchObject({ planCents: 50_000, istCents: 52_000, over: true });
    expect(by['rent']?.over).toBe(false);
    expect(month.overCount).toBe(2);
  });
  it('plans a periodic category with its reserve, not only the twelfth', () => {
    const car = month.items.find((x) => x.id === 'car');
    expect(car).toMatchObject({ planCents: 60_000, planBasis: 'reserve', over: false });
    expect(month.items.find((x) => x.id === 'trip')).toMatchObject({
      planCents: 4_000,
      over: true,
    });
  });
  it('leaves out categories with neither plan nor spending and keeps a net refund', () => {
    expect(month.items.map((x) => x.id)).not.toContain('unused');
    expect(month.items.find((x) => x.id === 'refund')).toMatchObject({
      istCents: -500,
      over: false,
    });
  });
  it('has a chain Plan minus Ist = Rest that adds up', () => {
    expect(month.planCents - month.istCents).toBe(month.restCents);
    expect(month.groups).toEqual(['Alltag', 'Wohnen']);
  });
});

describe('planDeviation', () => {
  it('sums assigned and spent over the months and sorts by the largest deviation', () => {
    const months = [
      [
        row({ id: 'a', assignedCents: 10_000, spendCents: 12_000 }),
        row({ id: 'b', assignedCents: 10_000, spendCents: 9_500 }),
      ],
      [
        row({ id: 'a', assignedCents: 10_000, spendCents: 12_000 }),
        row({ id: 'b', assignedCents: 10_000, spendCents: 9_500 }),
        row({ id: 'c', spendCents: 100 }),
      ],
    ];
    const rows = planDeviation(months);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(rows[0]).toMatchObject({
      planCents: 20_000,
      istCents: 24_000,
      deviationBp: 2_000,
      inBand: false,
    });
    expect(rows[1]).toMatchObject({ deviationBp: -500, inBand: true });
  });
  it('has no rows without a plan', () => {
    expect(planDeviation([])).toEqual([]);
  });
});
