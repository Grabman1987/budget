import { describe, expect, it } from 'vitest';
import { allocation, assignedMonth, percentShares, type AllocMonth } from './alloc';

describe('allocation (50/30/20 on assigned money)', () => {
  const month = (over: Partial<AllocMonth> = {}): AllocMonth => ({
    incomeCents: 400000,
    annualIncomeCents: 0,
    items: [
      { class: 'need', cents: 200000 },
      { class: 'want', cents: 120000 },
      { class: 'future', cents: 80000 },
    ],
    ...over,
  });

  it('sums the classes and leaves the rest', () => {
    const r = allocation([month()]);
    expect(r).toMatchObject({
      needCents: 200000,
      wantCents: 120000,
      futureCents: 80000,
      incomeCents: 400000,
      restCents: 0,
    });
  });

  it('annual items count as twelfths, on the cost and on the income side', () => {
    const r = allocation([
      month({
        annualIncomeCents: 1200000,
        items: [
          { class: 'need', cents: 100000 },
          { class: 'want', cents: 240000, annual: true },
        ],
      }),
    ]);
    expect(r.incomeCents).toBe(400000 + 100000);
    expect(r.needCents).toBe(100000);
    expect(r.wantCents).toBe(20000);
    expect(r.restCents).toBe(500000 - 100000 - 20000);
  });

  it('spreads annual amounts exactly over several months (no cent is lost or invented)', () => {
    const months = Array.from({ length: 12 }, () =>
      month({ items: [{ class: 'want', cents: 100003, annual: true }] }),
    );
    // 12 months x 100003 / 12 = 100003 exactly
    expect(allocation(months).wantCents).toBe(100003);
  });

  it('shares always add up to 100 %, the rest absorbs rounding; negative rest means "aus Guthaben"', () => {
    const r = allocation([
      month({
        items: [
          { class: 'need', cents: 310103 },
          { class: 'want', cents: 192865 },
          { class: 'future', cents: 150888 },
        ],
        incomeCents: 575788,
      }),
    ]);
    expect(r.shares).toEqual({ need: 54, want: 33, future: 26, rest: -13 });
    for (const income of [1, 333333, 575788]) {
      const s = percentShares({
        needCents: 1000,
        wantCents: 700,
        futureCents: 500,
        incomeCents: income,
      });
      expect(s.need + s.want + s.future + s.rest).toBe(100);
    }
  });

  it('income of zero gives zero shares instead of dividing by zero', () => {
    expect(percentShares({ needCents: 0, wantCents: 0, futureCents: 0, incomeCents: 0 })).toEqual({
      need: 0,
      want: 0,
      future: 0,
      rest: 0,
    });
  });
});

describe('assignedMonth (what counts in the month)', () => {
  it('periodic costs and windfall transfers count as twelfths of their year, everything else as booked', () => {
    const m = assignedMonth({
      regularIncomeCents: 381200,
      specialIncomeAnnualCents: 812200,
      categories: [
        { class: 'need', kind: 'regular', actualCents: 89000 },
        { class: 'need', kind: 'periodic', actualCents: 0, annualPlannedCents: 48600 },
        // Windfall categories: monthly rule amount + a share of the annual special payments
        {
          class: 'future',
          kind: 'windfall',
          actualCents: 0,
          regularCents: 40000,
          windfallShare: 0.5,
        },
      ],
    });
    expect(m.incomeCents).toBe(381200);
    expect(m.annualIncomeCents).toBe(812200);
    expect(m.items).toEqual([
      { class: 'need', cents: 89000 },
      { class: 'need', cents: 48600, annual: true },
      { class: 'future', cents: 40000 },
      { class: 'future', cents: 406100, annual: true },
    ]);
  });
});
