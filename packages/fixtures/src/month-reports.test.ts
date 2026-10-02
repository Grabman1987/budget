import {
  createTestDatabase,
  ensureDefaultRules,
  matchOccurrences,
  monthFlowReport,
  monthIncomeReport,
  monthOnePager,
  refreshOccurrences,
  type Db,
} from '@budget/db';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { seedDatabase } from './seed';

/**
 * The reports of "Monat und Einkommen" on the synthetic sample ledger at 17.09.2026, against the
 * prototype's figures (`design/prototype/reports-monat.js`) wherever the ledger defines them.
 * Deliberate differences: Kapitalerträge and refunds are no household income (owner decision
 * 02.10.2026).
 */
vi.setConfig({ testTimeout: 200_000 });

const TODAY = '2026-09-17';

let db: Db;
beforeAll(() => {
  db = createTestDatabase().db;
  seedDatabase(db);
  ensureDefaultRules(db);
}, 100_000);

describe('Monats-One-Pager, August 2026', () => {
  it('splits the assigned money 54 / 34 / 26 / −14 % as the prototype does', () => {
    const o = monthOnePager(db, TODAY, '2026-08');
    expect(o.allocation.shares).toEqual({ need: 54, want: 34, future: 26, rest: -14 });
    expect(o.partial).toBe(false);
  });

  it('the result chain adds up and leaves Kapitalerträge out of the household income', () => {
    const o = monthOnePager(db, TODAY, '2026-08');
    const r = o.result;
    expect(r.savedCents).toBe(r.earnedCents - r.consumptionCents);
    expect(r.restCents).toBe(r.savedCents - r.futureCents);
    expect(o.capitalCents).toBeGreaterThan(0);
    const income = monthIncomeReport(db, TODAY, '2026-08');
    expect(income.income.earnedCents).toBe(r.earnedCents);
    expect(income.income.capitalCents).toBe(o.capitalCents);
  });

  it('the largest spending is the trip, as in the prototype, with the change to July', () => {
    const o = monthOnePager(db, TODAY, '2026-08');
    expect(o.top[0]).toMatchObject({ name: 'Reisen', cents: 290_725, previousCents: 0 });
    expect(o.top).toHaveLength(8);
    expect(o.plan.over[0]?.name).toBe('Reisen');
    expect(o.findings.map((f) => f.rule)).toContain('R05');
  });

  it('net worth and Finanz-Check come from the same functions as Heute', () => {
    const o = monthOnePager(db, TODAY, '2026-08');
    if ('unavailable' in o.netWorth || 'unavailable' in o.check)
      throw new Error('Sample valuation must be available');
    expect(o.netWorth.series).toHaveLength(12);
    expect(o.netWorth.series.at(-1)).toEqual({ month: '2026-08', cents: o.netWorth.cents });
    expect(o.netWorth.previousMonthEndCents + o.netWorth.ownCents + o.netWorth.marketCents).toBe(
      o.netWorth.cents,
    );
    expect(o.check.total).toBe(16);
    expect(o.check.ok + o.check.warn + o.check.bad + o.check.notRated).toBe(16);
  });
});

describe('Monats-One-Pager, September 2026 (running)', () => {
  it('is partial, evaluated today, and announces the salary that follows', () => {
    const o = monthOnePager(db, TODAY, '2026-09');
    expect(o).toMatchObject({ partial: true, asOf: TODAY });
    expect(o.findings[0]).toMatchObject({ rule: 'R04' });
    expect(o.findings[0]?.text).toContain('17.09.');
  });
});

describe('Einnahmen', () => {
  it('without materialised occurrences the schedule stands in and claims nothing about receipt', () => {
    const r = monthIncomeReport(db, TODAY, '2026-09');
    expect(r.expectedMaterialised).toBe(false);
    expect(r.expected.lines.map((l) => [l.name, l.status])).toEqual([
      ['Beitrag zum Haushalt', 'unlinked'],
      ['Gehalt', 'pending'],
      ['Nebeneinkünfte', 'unplanned'],
    ]);
    expect(r.expected).toMatchObject({ pendingCount: 1, pendingCents: 381_200 });
  });

  it('twelve months by type; the shares add up to 100; Kapitalerträge are separate', () => {
    const r = monthIncomeReport(db, TODAY, '2026-09');
    expect(r.window.months).toHaveLength(12);
    expect(r.window.rows.reduce((a, x) => a + x.sharePercent, 0)).toBe(100);
    expect(r.window.rows.map((x) => x.name)).not.toContain('Kapitalerträge');
    expect(r.window.rows.map((x) => x.name)).not.toContain('Erstattungen');
    expect(r.window.capital.sumCents).toBeGreaterThan(0);
    const sum = r.window.rows.reduce((a, x) => a + x.sumCents, 0);
    expect(r.window.totalCents).toBe(sum);
  });

  it('with matched occurrences August is complete: nothing missing, nothing unplanned from salary', () => {
    const matched = createTestDatabase().db;
    seedDatabase(matched);
    refreshOccurrences(matched, TODAY);
    matchOccurrences(matched, TODAY);
    const r = monthIncomeReport(matched, TODAY, '2026-08');
    expect(r.expectedMaterialised).toBe(true);
    expect(r.expected.missingCount).toBe(0);
    const salary = r.expected.lines.find((l) => l.name === 'Gehalt');
    expect(salary).toMatchObject({ status: 'ok' });
    expect(salary?.receivedCents).toBe(salary?.expectedCents);
    const september = monthIncomeReport(matched, TODAY, '2026-09');
    expect(september.expected.lines.find((l) => l.name === 'Beitrag zum Haushalt')).toMatchObject({
      status: 'missing',
    });
  });
});

describe('Geldfluss', () => {
  it('the month: every column adds up and the chain ends in Aus Guthaben (the trip)', () => {
    const r = monthFlowReport(db, TODAY, '2026-08', 'month');
    const sum = (n: { cents: number }[]) => n.reduce((a, x) => a + x.cents, 0);
    const { flow } = r;
    expect(sum(flow.columns.income)).toBe(flow.totalCents);
    expect(sum(flow.columns.classes)).toBe(flow.totalCents);
    expect(sum(flow.columns.groups)).toBe(flow.spentCents);
    expect(flow.restCents).toBeLessThan(0);
    expect(flow.chain.at(-1)?.label).toBe('Aus Guthaben');
    const income = monthIncomeReport(db, TODAY, '2026-08');
    expect(flow.earnedCents).toBe(income.income.earnedCents);
    expect(flow.capitalCents).toBe(income.income.capitalCents);
  });

  it('twelve months end at the last full month and the flow agrees with the one-pager sums', () => {
    const r = monthFlowReport(db, TODAY, '2026-09', 'year');
    expect(r).toMatchObject({ from: '2025-09', to: '2026-08', monthCount: 12 });
    const monthly = [
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ].map((m) => monthFlowReport(db, TODAY, m, 'month').flow);
    expect(r.flow.earnedCents).toBe(monthly.reduce((a, f) => a + f.earnedCents, 0));
    expect(r.flow.spentCents).toBe(monthly.reduce((a, f) => a + f.spentCents, 0));
  });

  it('the running month is only what has happened so far', () => {
    const r = monthFlowReport(db, TODAY, '2026-09', 'month');
    expect(r.partial).toBe(true);
    expect(r.flow.restCents).toBeLessThan(0);
  });
});
