import { describe, expect, it } from 'vitest';
import type { CategoryTarget, WaterfallRow } from '../ledger/targets';
import {
  cardCovered,
  debtOrder,
  payYourselfFirst,
  sinkingFundsCovered,
  windfallCheck,
  windfallSplit,
  type AssignmentEvent,
} from './rules';

const byDate = (amountCents: number, targetDate: string): CategoryTarget => ({
  kind: 'by_date',
  amountCents,
  everyMonths: 1,
  targetDate,
});
const env = (carryCents: number, assignedCents: number, month = '2026-10') => ({
  month,
  carryCents,
  assignedCents,
  refill: false,
});

describe('sinkingFundsCovered (R05)', () => {
  it('funds on track meet targetNeed; the others report what is missing', () => {
    const r = sinkingFundsCovered([
      // 486 € due Jan 2027, 4 months (Oct to Jan): 121,50 a month; assigned exactly that
      { id: 'ins', target: byDate(48_600, '2027-01-15'), envelope: env(0, 12_150) },
      // 1.400 € due Feb: 5 months, 280 a month; only 100 assigned
      { id: 'trip', target: byDate(140_000, '2027-02-10'), envelope: env(0, 10_000) },
      // already full through carry
      { id: 'gifts', target: byDate(9000, '2026-12-12'), envelope: env(9000, 0) },
    ]);
    expect(r.covered).toBe(2);
    expect(r.total).toBe(3);
    expect(r.uncovered).toEqual([{ id: 'trip', shortCents: 18_000, dueMonth: '2027-02' }]);
  });

  it('due month reached: everything still missing is short', () => {
    const r = sinkingFundsCovered([
      { id: 'a', target: byDate(58_000, '2026-10-20'), envelope: env(30_000, 0) },
    ]);
    expect(r.uncovered).toEqual([{ id: 'a', shortCents: 28_000, dueMonth: '2026-10' }]);
  });

  it('no funds: nothing to cover', () => {
    expect(sinkingFundsCovered([])).toEqual({ covered: 0, total: 0, uncovered: [] });
  });
});

describe('cardCovered (R06)', () => {
  it('balance <= available in the card envelope', () => {
    const r = cardCovered([
      { id: 'c1', owedCents: 45_000, availableCents: 45_000 },
      { id: 'c2', owedCents: 20_000, availableCents: 5000 },
      { id: 'c3', owedCents: 0, availableCents: -100 },
      { id: 'c4', owedCents: -300, availableCents: 0 },
    ]);
    expect(r.allCovered).toBe(false);
    expect(r.cards.map((c) => [c.id, c.covered, c.shortCents])).toEqual([
      ['c1', true, 0],
      ['c2', false, 15_000],
      ['c3', true, 0],
      ['c4', true, 0],
    ]);
  });

  it('without cards everything is covered', () => {
    expect(cardCovered([])).toEqual({ allCovered: true, cards: [] });
  });

  it('a negative envelope with a balance owed is short by both', () => {
    expect(
      cardCovered([{ id: 'x', owedCents: 1000, availableCents: -500 }]).cards[0]?.shortCents,
    ).toBe(1500);
  });
});

describe('windfallSplit (R12)', () => {
  const rows: WaterfallRow[] = [
    { id: 'fix', stage: 1, sortOrder: 0, needCents: 30_000 },
    { id: 'reserve', stage: 4, sortOrder: 0, needCents: 100_000 },
    { id: 'invest', stage: 7, sortOrder: 0, needCents: 200_000 },
  ];

  it('10 % Genuss, the rest by waterfall', () => {
    const r = windfallSplit({ amountCents: 200_000, rows });
    expect(r.enjoyCents).toBe(20_000);
    expect(r.restCents).toBe(180_000);
    expect(r.fill).toEqual({ fix: 30_000, reserve: 100_000, invest: 50_000 });
    expect(r.leftoverCents).toBe(0);
  });

  it('what no stage asks for stays over; the parts always add up', () => {
    const r = windfallSplit({ amountCents: 123_457, rows: [rows[0] as WaterfallRow] });
    expect(r.enjoyCents).toBe(12_346);
    expect(r.enjoyCents + r.restCents).toBe(123_457);
    expect(r.leftoverCents).toBe(r.restCents - 30_000);
  });

  it('other shares, zero and negative amounts', () => {
    expect(windfallSplit({ amountCents: 10_000, rows, enjoyBp: 2500 }).enjoyCents).toBe(2500);
    const zero = windfallSplit({ amountCents: 0, rows });
    expect(zero).toEqual({
      amountCents: 0,
      enjoyCents: 0,
      restCents: 0,
      fill: {},
      leftoverCents: 0,
    });
    expect(windfallSplit({ amountCents: -5, rows }).amountCents).toBe(0);
  });
});

describe('windfallCheck (R12)', () => {
  it('ok when at most the Genuss share went to enjoyment and everything has a job', () => {
    const r = windfallCheck({
      amountCents: 200_000,
      assignedEnjoyCents: 20_000,
      assignedOtherCents: 180_000,
    });
    expect(r).toEqual({
      expectedEnjoyCents: 20_000,
      enjoyDiffCents: 0,
      undistributedCents: 0,
      enjoyWithinShare: true,
      fullyDistributed: true,
      ok: true,
    });
  });

  it('flags more than 10 % on enjoyment and money left to distribute', () => {
    const more = windfallCheck({
      amountCents: 200_000,
      assignedEnjoyCents: 50_000,
      assignedOtherCents: 150_000,
    });
    expect(more.enjoyDiffCents).toBe(30_000);
    expect(more.enjoyWithinShare).toBe(false);
    expect(more.ok).toBe(false);
    const open = windfallCheck({
      amountCents: 200_000,
      assignedEnjoyCents: 0,
      assignedOtherCents: 150_000,
    });
    expect(open.undistributedCents).toBe(50_000);
    expect(open.fullyDistributed).toBe(false);
    expect(open.enjoyWithinShare).toBe(true);
    expect(open.ok).toBe(false);
  });

  it('handles a zero payment', () => {
    expect(windfallCheck({ amountCents: 0, assignedEnjoyCents: 0, assignedOtherCents: 0 }).ok).toBe(
      true,
    );
  });
});

describe('payYourselfFirst (R04)', () => {
  const a = (
    day: string,
    amountCents: number,
    cls: AssignmentEvent['class'] = 'future',
  ): AssignmentEvent => ({
    day,
    class: cls,
    amountCents,
  });

  it('Zukunft is funded within 3 days after each salary', () => {
    const r = payYourselfFirst({
      salaryDays: ['2026-09-30', '2026-08-31'],
      targetCents: 65_000,
      assignments: [
        a('2026-08-31', 25_000),
        a('2026-09-02', 40_000), // 2 days after the 31.8.
        a('2026-09-30', 25_000),
        a('2026-10-03', 40_000), // 3 days after: still in time
        a('2026-10-04', 99_999), // too late for the 30.9.
        a('2026-09-30', 99_999, 'need'), // other class
      ],
    });
    expect(r.occurrences.map((o) => [o.salaryDay, o.fundedCents, o.ok])).toEqual([
      ['2026-08-31', 65_000, true],
      ['2026-09-30', 65_000, true],
    ]);
    expect(r.ok).toBe(true);
  });

  it('one late month fails the check; moving money out reduces what counts', () => {
    const r = payYourselfFirst({
      salaryDays: ['2026-09-30'],
      targetCents: 65_000,
      assignments: [a('2026-09-30', 65_000), a('2026-10-01', -5000)],
    });
    expect(r.occurrences[0]).toEqual({
      salaryDay: '2026-09-30',
      fundedCents: 60_000,
      targetCents: 65_000,
      ok: false,
    });
    expect(r.ok).toBe(false);
  });

  it('the window is configurable; no salary means unknown', () => {
    const assignments = [a('2026-10-05', 100)];
    expect(
      payYourselfFirst({ salaryDays: ['2026-09-30'], assignments, targetCents: 100, withinDays: 3 })
        .ok,
    ).toBe(false);
    expect(
      payYourselfFirst({ salaryDays: ['2026-09-30'], assignments, targetCents: 100, withinDays: 5 })
        .ok,
    ).toBe(true);
    expect(payYourselfFirst({ salaryDays: [], assignments, targetCents: 100 })).toEqual({
      occurrences: [],
      ok: null,
    });
  });

  it('a zero target is always met', () => {
    expect(
      payYourselfFirst({ salaryDays: ['2026-09-30'], assignments: [], targetCents: 0 }).ok,
    ).toBe(true);
  });
});

describe('debtOrder (R09)', () => {
  const loans = [
    { id: 'car', rateBp: 620, balanceCents: 800_000 },
    { id: 'card', rateBp: 1199, balanceCents: 120_000 },
    { id: 'mortgage', rateBp: 310, balanceCents: 9_000_000 },
    { id: 'study', rateBp: 620, balanceCents: 300_000 },
    { id: 'edge', rateBp: 500, balanceCents: 10_000 },
    { id: 'paid', rateBp: 900, balanceCents: 0 },
  ];

  it('avalanche: loans above 5 % by rate, extra repayment before investing', () => {
    const r = debtOrder({ loans, availableCents: 500_000 });
    expect(r.priority.map((l) => l.id)).toEqual(['card', 'study', 'car']);
    expect(r.allocations).toEqual([
      { id: 'card', cents: 120_000 },
      { id: 'study', cents: 300_000 },
      { id: 'car', cents: 80_000 },
    ]);
    expect(r.toInvestCents).toBe(0);
    expect(r.expensiveDebtOpen).toBe(true);
  });

  it('snowball: smallest balance first', () => {
    const r = debtOrder({ loans, availableCents: 150_000, strategy: 'snowball' });
    expect(r.priority.map((l) => l.id)).toEqual(['card', 'study', 'car']);
    const s2 = debtOrder({
      loans: [
        { id: 'big', rateBp: 1500, balanceCents: 500_000 },
        { id: 'small', rateBp: 600, balanceCents: 50_000 },
      ],
      availableCents: 60_000,
      strategy: 'snowball',
    });
    expect(s2.priority.map((l) => l.id)).toEqual(['small', 'big']);
    expect(s2.allocations).toEqual([
      { id: 'small', cents: 50_000 },
      { id: 'big', cents: 10_000 },
    ]);
  });

  it('what is left after the expensive loans goes to investing; the threshold can change', () => {
    const r = debtOrder({ loans, availableCents: 2_000_000 });
    expect(r.toInvestCents).toBe(2_000_000 - 120_000 - 300_000 - 800_000);
    const low = debtOrder({ loans, availableCents: 0, thresholdBp: 300 });
    expect(low.priority.map((l) => l.id)).toEqual(['card', 'study', 'car', 'edge', 'mortgage']);
    expect(low.allocations).toEqual([]);
  });

  it('no expensive debt: everything can be invested', () => {
    const r = debtOrder({
      loans: [{ id: 'm', rateBp: 300, balanceCents: 1 }],
      availableCents: 5000,
    });
    expect(r).toEqual({
      priority: [],
      allocations: [],
      toInvestCents: 5000,
      expensiveDebtOpen: false,
    });
    expect(debtOrder({ loans: [], availableCents: -5 }).toInvestCents).toBe(0);
  });
});
