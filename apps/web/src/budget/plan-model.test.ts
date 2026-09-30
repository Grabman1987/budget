import { describe, expect, it } from 'vitest';
import type { BudgetMonthView, EnvelopeSummary } from './budget-api';
import {
  barFor,
  coverSource,
  groupStatus,
  planGroups,
  planRows,
  suggestions,
  unassignPlan,
  type PlanContext,
} from './plan-model';

const env = (categoryId: string, over: Partial<EnvelopeSummary> = {}): EnvelopeSummary => ({
  categoryId,
  carryCents: 0,
  assignedCents: 0,
  activityCents: 0,
  availableCents: 0,
  overspentCents: 0,
  cashOverspentCents: 0,
  creditOverspentCents: 0,
  fundedCardCents: 0,
  goalCents: 0,
  needCents: 0,
  dueMonth: null,
  target: null,
  ...over,
});
const cat = (id: string, stage: number | null, kind = 'variable', cls: string | null = 'need') => ({
  id,
  name: id,
  icon: null,
  groupId: 'g',
  class: cls,
  kind,
  stage,
  cardAccountId: kind === 'card_payment' ? 'karte' : null,
  rolloverOverspending: false,
  sortOrder: 0,
  hiddenAt: null,
  splitCount: 0,
});
const target = (dueDay: number | null = null) => ({
  id: 't',
  categoryId: 'x',
  kind: 'monthly' as const,
  amountCents: 89_000,
  everyMonths: 1,
  targetDate: null,
  dueDay,
  validFrom: '2026-01',
});

const data = {
  groups: [{ id: 'g', name: 'Alltag', sortOrder: 0 }],
  categories: [
    cat('miete', 1, 'fixed'),
    cat('essen', 2),
    cat('treibstoff', 2),
    cat('cafe', 2, 'variable', 'want'),
    cat('etf', 8, 'invest', 'future'),
    cat('karte', null, 'card_payment', null),
  ].map((c, i) => ({ ...c, sortOrder: i })),
  summary: {
    envelopes: [
      env('miete', { needCents: 89_000, goalCents: 89_000, target: target(1) }),
      env('essen', {
        assignedCents: 20_000,
        activityCents: -15_000,
        availableCents: 5_000,
        needCents: 10_000,
        goalCents: 30_000,
      }),
      env('treibstoff', {
        assignedCents: 10_000,
        activityCents: -11_240,
        availableCents: -1_240,
        overspentCents: 1_240,
        cashOverspentCents: 1_240,
      }),
      env('cafe', {
        assignedCents: 5_000,
        activityCents: -7_000,
        availableCents: -2_000,
        overspentCents: 2_000,
        creditOverspentCents: 2_000,
      }),
      env('etf', { assignedCents: 40_000, needCents: 0, goalCents: 40_000 }),
      env('karte', { activityCents: 5_000, availableCents: 5_000 }),
    ],
  },
} as unknown as BudgetMonthView;
const ctx: PlanContext = { month: '2026-09', today: '2026-09-17', cardName: () => 'Kreditkarte' };

describe('Plan › Monat view model', () => {
  const rows = planRows(data);

  it('orders by stage with the card envelopes first, and knows cash from credit overspending', () => {
    const groups = planGroups('stage', rows, data, ctx);
    expect(groups.map((g) => g.key).slice(0, 3)).toEqual(['cards', 's1', 's2']);
    expect(groups.find((g) => g.key === 's2')?.rows.map((r) => r.id)).toEqual([
      'essen',
      'treibstoff',
      'cafe',
    ]);
    const triage = planGroups('triage', rows, data, ctx);
    expect(triage.map((g) => g.rows.map((r) => r.id))).toEqual([
      ['treibstoff'],
      ['cafe'],
      ['miete'],
      ['essen'],
    ]);
    expect(groupStatus(groups.find((g) => g.key === 's2')!.rows)).toMatchObject({
      cashOver: 1,
      state: 'over',
    });
  });

  it('suggests top-down, takes back bottom-up, and covers from a Wunsch envelope', () => {
    expect(suggestions(rows, 95_000)).toEqual({ miete: 89_000, essen: 6_000 });
    expect(unassignPlan(rows, 42_000)).toEqual([
      ['etf', 40_000],
      ['cafe', 2_000],
    ]);
    const essenRich = rows.map((r) => (r.id === 'cafe' ? { ...r, availableCents: 3_000 } : r));
    expect(
      coverSource(
        essenRich,
        essenRich.find((r) => r.id === 'treibstoff')!,
      )?.id,
    ).toBe('cafe');
  });

  it('words the pace bar: spent, over pace, overspent, due, new card debt', () => {
    const by = (id: string) => rows.find((r) => r.id === id)!;
    expect(barFor(by('essen'), ctx)).toMatchObject({
      fill: 0.75,
      meta: expect.stringContaining('über Pace'),
    });
    expect(barFor(by('treibstoff'), ctx)).toMatchObject({
      over: true,
      meta: expect.stringContaining('12,40 € überzogen'),
    });
    expect(barFor(by('cafe'), ctx).meta).toContain('neue Kartenschuld 20,00 €');
    expect(barFor(by('miete'), ctx)).toMatchObject({ icon: 'clock', meta: 'fällig am 01.' });
    expect(barFor(by('karte'), ctx).meta).toBe('Kartenzahlung · Kreditkarte');
  });
});
