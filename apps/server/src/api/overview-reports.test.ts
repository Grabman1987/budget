import { DEFAULT_ACTIVE_RULE_COUNT } from '@budget/domain';
/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import {
  budget,
  createTestDatabase,
  ensureDefaultRules,
  evaluateRules,
  overviewData,
  schema,
  type Db,
} from '@budget/db';
import { monthsBetween, overviewMonthlyFigures } from '@budget/domain';
import { seedDatabase } from '@budget/fixtures/seed';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp, type AuthGate } from '../app';

vi.setConfig({ testTimeout: 120_000 });

// The Überblick report endpoints on the synthetic sample ledger at 17.09.2026 (last full month:
// August 2026): every figure is checked against the shared read models, not against constants.
const TODAY = '2026-09-17';
const webDir = mkdtempSync(join(tmpdir(), 'budget-overview-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};

let db: Db;
let app: ReturnType<typeof createApp>;
beforeAll(() => {
  db = createTestDatabase().db;
  seedDatabase(db);
  ensureDefaultRules(db);
  evaluateRules(db, TODAY);
  app = createApp({ webDir, auth: signedIn, ledger: { db, today: () => TODAY } });
}, 240_000);

async function get(path: string) {
  const res = await app.request(`/api/overview${path}`);
  return { status: res.status, body: (await res.json()) as any };
}

describe('the shared definition of income and spending', () => {
  it('Konsum equals the envelope activity of Bedarf and Wunsch of the budget', () => {
    const data = overviewData(db);
    const figures = overviewMonthlyFigures(data);
    const months = monthsBetween('2025-01', '2026-08');
    const classOf = new Map(
      db
        .select()
        .from(schema.category)
        .all()
        .map((c) => [c.id, c.class]),
    );
    for (const m of budget(db, months)) {
      let spent = 0;
      let future = 0;
      for (const [id, e] of Object.entries(m.envelopes)) {
        const cls = classOf.get(id);
        if (cls === 'need' || cls === 'want') spent -= e.activityCents;
        else if (cls === 'future') future -= e.activityCents;
      }
      expect(figures.get(m.month)?.consumptionCents, m.month).toBe(spent);
      expect(figures.get(m.month)?.futureCents, `${m.month} future`).toBe(future);
    }
  });

  it('keeps dividends and interest out of household income', () => {
    const data = overviewData(db);
    const capital = data.splits.filter((s) => s.incomeGroup === 'capital');
    expect(capital.length).toBeGreaterThan(0);
    const figures = overviewMonthlyFigures(data);
    for (const f of figures.values()) {
      const household = data.splits
        .filter((s) => s.kind === 'income' && s.date.startsWith(f.month))
        .filter((s) => s.incomeGroup === 'household')
        .reduce((a, s) => a + s.amountCents, 0);
      expect(f.incomeCents).toBe(household);
    }
  });
});

describe('GET /api/overview/year', () => {
  it('builds 2026 from the eight full months, with a net worth chain that adds up', async () => {
    const { status, body } = await get('/year');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      ref: '2026-08',
      firstMonth: '2023-10',
      years: [2026, 2025, 2024, 2023],
    });
    const r = body.report;
    expect(r.year).toBe(2026);
    expect(r.months).toHaveLength(8);
    expect(r.partial).toBe(true);
    const sum = (key: string) => r.rows.reduce((a: number, row: any) => a + row[key], 0);
    expect(r.totals.incomeCents).toBe(sum('incomeCents'));
    expect(r.totals.consumptionCents).toBe(sum('consumptionCents'));
    expect(r.totals.capitalCents).toBe(sum('capitalCents'));
    expect(r.netWorth.startCents + r.netWorth.ownCents + r.netWorth.marketCents).toBe(
      r.netWorth.endCents,
    );
    const marketSum = r.netWorth.months.reduce((a: number, m: any) => a + m.marketCents, 0);
    const ownSum = r.netWorth.months.reduce((a: number, m: any) => a + m.ownCents, 0);
    expect([ownSum, marketSum]).toEqual([r.netWorth.ownCents, r.netWorth.marketCents]);
    expect(r.netWorth.months.at(-1).endCents).toBe(r.netWorth.endCents);
    const s = r.shares;
    expect(s.need + s.want + s.future + s.rest).toBe(100);
    expect(r.categories).toHaveLength(10);
    expect(r.comparedMonths).toBe(8);
  });

  it('reads the stored Finanz-Check of the last month end and says nothing for older years', async () => {
    const now = (await get('/year?year=2026')).body;
    expect(now.rules).toMatchObject({ asOf: '2026-08-31', total: DEFAULT_ACTIVE_RULE_COUNT });
    expect(now.rules.cells.length).toBeGreaterThan(0);
    const old = (await get('/year?year=2024')).body;
    expect(old.rules).toBeNull();
    expect(old.report.months).toHaveLength(12);
    expect(old.report.partial).toBe(false);
  });

  it('answers a year without data with empty figures, and rejects a broken year', async () => {
    const future = (await get('/year?year=2030')).body.report;
    expect(future.months).toEqual([]);
    expect(future.netWorth).toBeNull();
    expect(future.shares).toBeNull();
    expect((await get('/year?year=abc')).status).toBe(400);
  });

  it('starts the first year at the first month of the ledger and has no year before to compare', async () => {
    const r = (await get('/year?year=2023')).body.report;
    expect(r.months[0]).toBe('2023-10');
    expect(r.comparedMonths).toBe(0);
    expect(r.categories[0].changeBp).toBeNull();
  });
});

describe('GET /api/overview/compare', () => {
  it('compares August 2026 with August 2025 and keeps the chain exact', async () => {
    const { status, body } = await get('/compare?mode=vj');
    expect(status).toBe(200);
    const c = body.comparison;
    expect(c.current).toEqual(['2026-08']);
    expect(c.previous).toEqual(['2025-08']);
    expect(c.chain.previousCents + c.chain.moreCents - c.chain.lessCents).toBe(
      c.chain.currentCents,
    );
    expect(c.chain.currentCents).toBe(c.currentTotals.consumptionCents);
    expect(c.chain.previousCents).toBe(c.previousTotals.consumptionCents);
    const delta = c.rows.reduce((a: number, r: any) => a + r.deltaCents, 0);
    expect(delta).toBe(c.chain.currentCents - c.chain.previousCents);
    expect(c.currentTotals.capitalCents).toBeGreaterThan(0);
  });

  it('aligns the months of the other modes and defaults to the Vorjahresmonat', async () => {
    const ytd = (await get('/compare?mode=ytd')).body.comparison;
    expect(ytd.current).toHaveLength(8);
    expect(ytd.previous[0]).toBe('2025-01');
    expect((await get('/compare?mode=r12')).body.comparison.previous[0]).toBe('2024-09');
    expect((await get('/compare?mode=vm')).body.comparison.previous).toEqual(['2026-07']);
    expect((await get('/compare')).body.comparison.mode).toBe('vj');
    expect((await get('/compare?mode=nope')).status).toBe(400);
  });
});

describe('GET /api/overview/explorer', () => {
  const q = (o: Record<string, string> = {}) =>
    new URLSearchParams({
      dim: 'kategorie',
      cls: 'alle',
      cols: 'monat',
      period: '1J',
      meas: 'summe',
      ...o,
    }).toString();

  it('adds up to the same Konsum and Zukunft as the other reports', async () => {
    const { status, body } = await get(`/explorer?${q()}`);
    expect(status).toBe(200);
    const r = body.result;
    expect(r.columns).toHaveLength(12);
    expect(r.months.at(-1)).toBe('2026-08');
    const figures = overviewMonthlyFigures(overviewData(db));
    const expected = r.months.reduce(
      (a: number, m: string) =>
        a +
        (figures.get(m)?.consumptionCents ?? 0) +
        (figures.get(m)?.futureCents ?? 0) +
        (figures.get(m)?.uncategorisedCents ?? 0),
      0,
    );
    expect(r.totals.total).toBe(expected);
    for (const row of r.rows)
      expect(row.values.reduce((a: number, b: number) => a + b, 0)).toBe(row.total);
  });

  it('pivots by recipient with booking counts and by income type with capital apart', async () => {
    const payees = (
      await get(`/explorer?${q({ dim: 'empfaenger', meas: 'anzahl', cols: 'jahr' })}`)
    ).body.result;
    expect(payees.unit).toBe('count');
    expect(payees.rows.length).toBeGreaterThan(5);
    const income = (await get(`/explorer?${q({ dim: 'einnahme', cols: 'jahr', period: 'Alles' })}`))
      .body.result;
    expect(income.good).toBe('high');
    expect(income.rows.map((x: any) => x.label)).toContain('Kapitalerträge');
    expect(income.rows.map((x: any) => x.label)).toContain('Gehalt');
  });

  it('rejects an unknown dimension and answers an empty ledger window honestly', async () => {
    expect((await get(`/explorer?${q({ dim: 'weird' })}`)).status).toBe(400);
    expect((await get('/explorer')).status).toBe(400);
    const empty = createTestDatabase().db;
    const alone = createApp({ webDir, auth: signedIn, ledger: { db: empty, today: () => TODAY } });
    const res = await alone.request(`/api/overview/explorer?${q()}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.result.rows).toEqual([]);
    expect(body.result.months).toEqual([]);
    expect(body.firstMonth).toBeNull();
    const year = (await (await alone.request('/api/overview/year')).json()) as any;
    expect(year.years).toEqual([]);
    expect(year.report.months).toEqual([]);
  });
});
