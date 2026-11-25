import { describe, expect, it } from 'vitest';
import { applyChecklistCredits, planContactChecklist, type ChecklistItem } from './checklist';

const rows: ChecklistItem[] = [
  { id: 'rent', kind: 'contribution', amountCents: 80000 },
  { id: 'sub', kind: 'contribution', amountCents: 1999 },
  { id: 'outlay', kind: 'outlay', amountCents: 2501 },
];

describe('planContactChecklist', () => {
  it('settles every ticked row when the payment is exact', () => {
    const plan = planContactChecklist(rows, 84500);
    expect(plan.restCents).toBe(0);
    expect(plan.paid.map((p) => p.amountCents)).toEqual([80000, 1999, 2501]);
    expect(plan.paid.reduce((s, p) => s + p.amountCents, 0)).toBe(84500);
    expect(plan.shortfallCents).toBe(0);
    expect(plan.surplusCents).toBe(0);
  });

  it('leaves the shortfall on the last row (the outlay) when paid less', () => {
    const plan = planContactChecklist(rows, 83000);
    expect(plan.restCents).toBe(-1500);
    expect(plan.shortfallCents).toBe(1500);
    expect(plan.paid.at(-1)).toEqual({
      id: 'outlay',
      kind: 'outlay',
      amountCents: 1001,
      shortCents: 1500,
    });
    expect(plan.paid.reduce((s, p) => s + p.amountCents, 0)).toBe(83000);
  });

  it('cuts earlier rows too when the shortfall exceeds the last row', () => {
    const plan = planContactChecklist(rows, 80500);
    expect(plan.paid).toEqual([
      { id: 'rent', kind: 'contribution', amountCents: 80000, shortCents: 0 },
      { id: 'sub', kind: 'contribution', amountCents: 500, shortCents: 1499 },
    ]);
    expect(plan.shortfallCents).toBe(4000);
  });

  it('reports the surplus when paid more and pays every row fully', () => {
    const plan = planContactChecklist(rows, 86000);
    expect(plan.restCents).toBe(1500);
    expect(plan.surplusCents).toBe(1500);
    expect(plan.paid.map((p) => p.shortCents)).toEqual([0, 0, 0]);
  });

  it('treats an empty selection as a pure surplus', () => {
    expect(planContactChecklist([], 1234)).toMatchObject({ paid: [], surplusCents: 1234 });
  });

  it('rejects fractional or negative cents', () => {
    expect(() => planContactChecklist(rows, 10.5)).toThrow(RangeError);
    expect(() => planContactChecklist(rows, -1)).toThrow(RangeError);
    expect(() => planContactChecklist([{ id: 'x', kind: 'outlay', amountCents: 0 }], 100)).toThrow(
      RangeError,
    );
  });
});

describe('applyChecklistCredits', () => {
  it('offsets a credit against the oldest outlay first, in whole cents', () => {
    const r = applyChecklistCredits(
      [
        { id: 'a', amountCents: 300 },
        { id: 'b', amountCents: 150 },
      ],
      [{ id: 'k', amountCents: 400 }],
    );
    expect(r.allocations).toEqual([
      { creditId: 'k', outlayId: 'a', amountCents: 300 },
      { creditId: 'k', outlayId: 'b', amountCents: 100 },
    ]);
    expect(r.outlays).toEqual([
      { id: 'a', amountCents: 0 },
      { id: 'b', amountCents: 50 },
    ]);
    expect(r.appliedByCredit.get('k')).toBe(400);
  });

  it('reports the part of a credit the outlays cannot take', () => {
    const r = applyChecklistCredits(
      [{ id: 'a', amountCents: 100 }],
      [
        { id: 'k1', amountCents: 80 },
        { id: 'k2', amountCents: 80 },
      ],
    );
    expect(r.appliedByCredit.get('k1')).toBe(80);
    expect(r.appliedByCredit.get('k2')).toBe(20);
    expect(r.outlays).toEqual([{ id: 'a', amountCents: 0 }]);
  });
});
