import { describe, expect, it } from 'vitest';
import { budgetMonths } from './budget';
import { summarizeMonth, targetFor, type VersionedTarget } from './summary';
import { targetNeed, waterfallFill, type CategoryTarget } from './targets';

const monthly = (amountCents: number, everyMonths = 1, targetDate: string | null = null) =>
  ({ kind: 'monthly', amountCents, everyMonths, targetDate }) satisfies CategoryTarget;

describe('targetNeed (Ziel je Kategorie)', () => {
  const env = { month: '2026-10', carryCents: 0, assignedCents: 0, refill: false };

  it('monthly: fixed costs set the amount aside, spending envelopes refill up to it', () => {
    expect(targetNeed(monthly(89000), { ...env, carryCents: 5000 }).needCents).toBe(89000);
    expect(targetNeed(monthly(60000), { ...env, carryCents: 2800, refill: true })).toEqual({
      goalCents: 57200,
      needCents: 57200,
      dueMonth: null,
    });
    expect(targetNeed(monthly(60000), { ...env, assignedCents: 70000 }).needCents).toBe(0);
  });

  it('by date: the rest spread over the months left, rounded up; past due asks for all', () => {
    const t = { kind: 'by_date', amountCents: 48600, everyMonths: 1, targetDate: '2027-01-15' };
    // Oct, Nov, Dec, Jan = 4 months, 283,50 € already there.
    expect(targetNeed(t as CategoryTarget, { ...env, carryCents: 28350 })).toEqual({
      goalCents: 5063,
      needCents: 5063,
      dueMonth: '2027-01',
    });
    expect(targetNeed(t as CategoryTarget, { ...env, month: '2027-03' }).needCents).toBe(48600);
  });

  it('every n months: the due date repeats; without a date an even share', () => {
    const yearly = monthly(60000, 12, '2026-03-01');
    // Next due 03.2027: Oct … Mar = 6 months for 600 € − 250 € carried.
    const need = targetNeed(yearly, { ...env, carryCents: 25000 });
    expect(need).toEqual({ goalCents: 5834, needCents: 5834, dueMonth: '2027-03' });
    expect(targetNeed(monthly(10000, 3), env).needCents).toBe(3334);
  });

  it('keep balance: carry and assigned should reach the amount', () => {
    const t = { kind: 'keep_balance', amountCents: 50000, everyMonths: 1, targetDate: null };
    expect(targetNeed(t as CategoryTarget, { ...env, carryCents: 30000 }).needCents).toBe(20000);
  });
});

describe('waterfallFill', () => {
  const rows = [
    { id: 'etf', stage: 8, sortOrder: 0, needCents: 40000 },
    { id: 'miete', stage: 1, sortOrder: 2, needCents: 89000 },
    { id: 'strom', stage: 1, sortOrder: 1, needCents: 10500 },
    { id: 'essen', stage: 2, sortOrder: 0, needCents: 15000 },
    { id: 'frei', stage: null, sortOrder: 0, needCents: 1000 },
  ];

  it('pours top-down by stage and list order until the money runs out', () => {
    expect(waterfallFill(rows, 105000)).toEqual({ strom: 10500, miete: 89000, essen: 5500 });
    expect(waterfallFill(rows, 1_000_000)).toMatchObject({ etf: 40000, frei: 1000 });
    expect(waterfallFill(rows, -5)).toEqual({});
  });
});

describe('summarizeMonth', () => {
  it('sums per group, reports target needs and a chain that adds up', () => {
    const months = budgetMonths({
      accounts: [{ id: 'giro', onBudget: true, openingBalanceCents: 0, openingDate: '2026-09-01' }],
      categories: [
        { id: 'miete', kind: 'fixed' },
        { id: 'essen', kind: 'variable' },
      ],
      splits: [
        { accountId: 'giro', date: '2026-09-01', amountCents: 200000, categoryId: null },
        { accountId: 'giro', date: '2026-09-03', amountCents: -89000, categoryId: 'miete' },
        { accountId: 'giro', date: '2026-10-01', amountCents: 100000, categoryId: null },
        { accountId: 'giro', date: '2026-10-05', amountCents: -12000, categoryId: 'essen' },
      ],
      months: ['2026-09', '2026-10'],
      assigned: { '2026-09': { miete: 89000, essen: 20000 }, '2026-10': { essen: 10000 } },
    });
    const targets: VersionedTarget[] = [
      { categoryId: 'essen', validFrom: '2026-01', ...monthly(30000) },
      { categoryId: 'essen', validFrom: '2026-11', ...monthly(99000) },
    ];
    expect(targetFor(targets, 'essen', '2026-10')?.amountCents).toBe(30000);
    const cats = [
      { id: 'miete', groupId: 'wohnen', kind: 'fixed' },
      { id: 'essen', groupId: 'genuss', kind: 'variable' },
    ];
    const s = summarizeMonth(months[1]!, cats, targets);
    expect(s.toBeAssignedCents).toBe(181000);
    expect(s.carryInCents).toBe(months[0]!.toBeAssignedCents);
    expect(s.carryInCents + s.incomeCents - s.uncoveredCents - s.assignedCents - s.heldCents).toBe(
      s.toBeAssignedCents,
    );
    expect(s.envelopes.find((e) => e.categoryId === 'essen')).toMatchObject({
      carryCents: 20000,
      availableCents: 18000,
      needCents: 0, // refill: 300 € − 200 € carried − 100 € assigned
    });
    expect(s.groups).toEqual([
      { groupId: 'wohnen', assignedCents: 0, activityCents: 0, availableCents: 0 },
      { groupId: 'genuss', assignedCents: 10000, activityCents: -12000, availableCents: 18000 },
    ]);
  });
});
