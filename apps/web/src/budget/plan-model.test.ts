import { describe, expect, it } from 'vitest';
import type { BudgetMonthView, EnvelopeSummary } from './budget-api';
import {
  assignGuard,
  barFor,
  coverFromToBeAssigned,
  coverSource,
  coverSources,
  dueDate,
  expectedDues,
  groupStatus,
  monthStatus,
  moveGuard,
  monthCells,
  planGroups,
  planMulti,
  planRows,
  readAssign,
  splitState,
  suggestions,
  unassignPlan,
  type PlanContext,
  type PlanRow,
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
      ['treibstoff', 'cafe'],
      ['miete'],
      ['essen'],
    ]);
    expect(groupStatus(groups.find((g) => g.key === 's2')!.rows)).toMatchObject({
      cashOver: 2,
      state: 'over',
    });
  });

  it('suggests top-down, takes back bottom-up, and covers from the largest sufficient envelope', () => {
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
    ).toBe('essen');
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

  it('reads an assign field: the pre-filled figure is absolute, a typed sign is relative', () => {
    // Pre-filled "−50,00" of a negative assignment: unchanged, not "−50 more".
    expect(readAssign('−50,00', -5_000, false)).toBe(-5_000);
    expect(readAssign('-50,00', -5_000, false)).toBe(-5_000);
    // A sign typed first into the emptied field is a change.
    expect(readAssign('+20', -5_000, true)).toBe(-3_000);
    expect(readAssign('−20', 10_000, true)).toBe(8_000);
    expect(readAssign('60+40', 0, false)).toBe(10_000);
    // "+50" without the relative flag (sign typed in front of the kept text) is just 50.
    expect(readAssign('+50', 10_000, false)).toBe(5_000);
    // Below 0 only when the envelope already is and it does not go lower.
    expect(readAssign('−20', 10_000, false)).toBeNull();
    expect(readAssign('−20', 1_000, true)).toBeNull();
    expect(readAssign('−10', -5_000, true)).toBeNull();
    expect(readAssign('abc', 0, false)).toBeNull();
  });

  it('covers from Zu verteilen at most what it holds', () => {
    expect(coverFromToBeAssigned(5_000, 10_000)).toEqual({ capCents: 5_000, short: false });
    expect(coverFromToBeAssigned(5_000, 2_000)).toEqual({ capCents: 2_000, short: true });
    expect(coverFromToBeAssigned(5_000, 0)).toEqual({ capCents: 0, short: true });
    expect(coverFromToBeAssigned(5_000, -3_000)).toEqual({ capCents: 0, short: true });
  });

  it('dates a yearly or periodic target on its own day, not the 1st of the due month', () => {
    const row = (t: Partial<PlanRow['target'] & object>, dueMonth: string | null): PlanRow =>
      ({
        ...rows[0]!,
        kind: 'periodic',
        dueMonth,
        target: { ...target(), everyMonths: 12, ...t },
      }) as PlanRow;
    expect(dueDate(row({ targetDate: '2026-03-17' }, '2027-03'), '2026-09')).toBe('2027-03-17');
    expect(dueDate(row({ targetDate: '2026-01-31' }, '2027-02'), '2026-09')).toBe('2027-02-28');
    expect(dueDate(row({ targetDate: '2026-10-05', dueDay: 20 }, '2026-10'), '2026-09')).toBe(
      '2026-10-20',
    );
    expect(
      dueDate(
        row({ kind: 'by_date', everyMonths: 1, targetDate: '2026-09-24' }, '2026-09'),
        '2026-09',
      ),
    ).toBe('2026-09-24');
    expect(dueDate(row({ targetDate: null }, null), '2026-09')).toBeNull();
    // The time view uses the real day: due on 05.10. is not within 14 days of 17.09. (the 1st was).
    const insurance = {
      ...row({ kind: 'by_date', everyMonths: 1, targetDate: '2026-10-05' }, '2026-10'),
      id: 'kfz',
    };
    const groups = planGroups('time', [insurance], data, ctx);
    expect(groups.find((g) => g.key === 't14')?.rows).toEqual([]);
    expect(groups.find((g) => g.key === 'tnext')?.rows.map((r) => r.id)).toEqual(['kfz']);
  });

  it('guards assigning: never more than Zu verteilen holds, reducing always passes', () => {
    expect(assignGuard(10_000, 4_000, 6_000)).toEqual({ ok: true });
    const refused = assignGuard(10_001, 4_000, 6_000);
    expect(refused).toMatchObject({ ok: false, maxCents: 10_000 });
    expect(refused.ok === false && refused.message).toContain('Höchstens 100,00 €');
    // Nothing free (also when negative): only values that do not raise pass.
    expect(assignGuard(4_001, 4_000, 0)).toMatchObject({ ok: false, maxCents: 4_000 });
    expect(assignGuard(4_001, 4_000, -2_000)).toMatchObject({ ok: false, maxCents: 4_000 });
    expect(assignGuard(3_000, 4_000, -2_000)).toEqual({ ok: true });
    expect(moveGuard(5_000, 5_000)).toEqual({ ok: true });
    expect(moveGuard(5_001, 5_000)).toMatchObject({ ok: false, maxCents: 5_000 });
    expect(moveGuard(1, -1)).toMatchObject({ ok: false, maxCents: 0 });
  });

  it('states the month truthfully: worst first, calm only when nothing applies', () => {
    const summary = (over: object) =>
      ({ toBeAssignedCents: 0, uncoveredCents: 0, ...over }) as BudgetMonthView['summary'];
    const calm = rows.filter((r) => r.id === 'miete');
    expect(monthStatus(summary({}), calm)).toEqual([
      { tone: 'good', text: 'Nichts ist überzogen.' },
    ]);
    const lines = monthStatus(
      summary({ toBeAssignedCents: -3_000, uncoveredCents: 512_168 }),
      rows,
    );
    expect(lines.map((l) => l.text)).toEqual([
      'Zu viel zugewiesen: 30,00 € fehlen',
      'Ungedeckt aus dem Vormonat: 5.121,68 €',
      '2 Envelopes überzogen',
    ]);
    expect(lines.map((l) => l.tone)).toEqual(['bad', 'bad', 'bad']);
    expect(monthStatus(summary({ uncoveredCents: 100 }), calm)[0]?.tone).toBe('bad');
  });

  it('50/30/20 keeps income shares when assignment exceeds income', () => {
    const income = (incomeCents: number) => ({ incomeCents }) as BudgetMonthView['summary'];
    const assigned = (id: string, assignedCents: number) =>
      rows.map((r) => (r.id === id ? { ...r, assignedCents } : { ...r, assignedCents: 0 }));
    expect(splitState(income(0), rows)).toEqual({ kind: 'no-income' });
    expect(splitState(income(-500), rows)).toEqual({ kind: 'no-income' });
    expect(splitState(income(100_000), assigned('essen', 0))).toEqual({ kind: 'empty' });
    // Overspending remains visible on the income scale.
    expect(splitState(income(1_000), assigned('essen', 51_290))).toMatchObject({
      kind: 'shares',
      need: 5129,
    });
    // A negative class sum counts as 0.
    expect(splitState(income(100_000), assigned('cafe', -86_100))).toEqual({ kind: 'empty' });
    const ok = splitState(income(100_000), [
      ...assigned('essen', 50_000),
      ...assigned('cafe', 30_000),
    ]);
    expect(ok.kind).toBe('shares');
    if (ok.kind === 'shares') {
      for (const v of [ok.need, ok.want, ok.future]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('the time view counts expected payments and is honest when there are none', () => {
    const payment = (over: object) =>
      ({
        id: 'p',
        name: 'Strom',
        kind: 'outflow',
        categoryId: 'essen',
        deletedAt: null,
        nextDueDate: '2026-09-25',
        amountCents: -10_500,
        version: { currency: 'EUR' },
        ...over,
      }) as Parameters<typeof expectedDues>[0][number];
    const dues = expectedDues([
      payment({}),
      payment({ id: 'q', categoryId: 'miete', nextDueDate: '2026-10-30' }),
      payment({ id: 'r', kind: 'inflow' }),
      payment({ id: 's', categoryId: null }),
      payment({ id: 't', deletedAt: '2026-09-01' }),
    ]);
    expect(dues.map((d) => [d.categoryId, d.date, d.amountCents])).toEqual([
      ['essen', '2026-09-25', -10_500],
      ['miete', '2026-10-30', -10_500],
    ]);
    const groups = planGroups('time', rows, data, { ...ctx, expected: dues });
    const by = (key: string) => groups.find((g) => g.key === key)!;
    // A variable envelope with an expected payment is dated, not "laufend"; miete's own target
    // day (1st) gives way to its expected payment.
    expect(by('t14').rows.map((r) => r.id)).toEqual(['essen']);
    expect(by('t14').rows[0]?.due).toMatchObject({ source: 'expected', name: 'Strom' });
    expect(by('tnext').rows.map((r) => r.id)).toEqual(['miete']);
    expect(by('tlater').rows).toEqual([]);
    // No expected payment at all: say so instead of "nichts fällig".
    const none = planGroups('time', rows, data, { ...ctx, expected: [] });
    expect(none.find((g) => g.key === 'tlater')).toMatchObject({
      rows: [],
      emptyText: 'keine wiederkehrenden Zahlungen erfasst',
    });
    // Payments exist but none is due in a bucket: plain "nichts fällig".
    expect(by('tlater').emptyText).toBe('nichts fällig');
  });

  it('every triage group has a calm empty sentence', () => {
    const quiet = planRows({
      ...data,
      summary: { ...data.summary, envelopes: data.summary.envelopes.map((e) => env(e.categoryId)) },
    } as BudgetMonthView);
    const groups = planGroups('triage', quiet, data, ctx);
    expect(groups.every((g) => g.rows.length === 0 && (g.emptyNote ?? '').length > 0)).toBe(true);
  });

  it('lines up several months by envelope, in the leftmost month order, with gaps where hidden', () => {
    const next = {
      ...data,
      categories: data.categories.map((c) =>
        c.id === 'cafe' ? { ...c, hiddenAt: '2026-09-20T00:00:00Z' } : c,
      ),
      summary: {
        ...data.summary,
        envelopes: data.summary.envelopes.map((e) =>
          e.categoryId === 'essen' ? { ...e, assignedCents: 25_000 } : env(e.categoryId),
        ),
      },
    } as BudgetMonthView;
    const groups = planMulti([data, next]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.rows.map((r) => r.id)).toEqual([
      'miete',
      'essen',
      'treibstoff',
      'cafe',
      'etf',
      'karte',
    ]);
    const cafe = groups[0]!.rows.find((r) => r.id === 'cafe')!;
    expect(cafe.cells[0]).toBeDefined();
    expect(cafe.cells[1]).toBeUndefined();
    expect(monthCells(groups[0]!.rows, 1)).toHaveLength(5);
    expect(groupStatus(monthCells(groups[0]!.rows, 0)).assigned).toBe(75_000);
    expect(groupStatus(monthCells(groups[0]!.rows, 1)).assigned).toBe(25_000);
    expect(planMulti([])).toEqual([]);
  });
});

it('uses positive free money, including partial sources, and excludes card payments', () => {
  const rows = planRows(data);
  const target = rows.find((r) => r.id === 'treibstoff')!;
  expect(coverSources(rows, target).map((r) => r.id)).toEqual(['essen']);
  const drained = rows.map((r) => (r.id === 'essen' ? { ...r, availableCents: 1239 } : r));
  expect(coverSource(drained, target)?.id).toBe('essen');
  const committed = rows.map((r) => (r.id === 'essen' ? { ...r, freeCents: 0 } : r));
  expect(coverSource(committed, target)).toBeUndefined();
  const replenished = drained.map((r) => (r.id === 'cafe' ? { ...r, availableCents: 1240 } : r));
  expect(coverSource(replenished, target)?.id).toBe('cafe');
});
