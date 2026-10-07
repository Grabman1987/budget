/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import { createTestDatabase, schema, type Db } from '@budget/db';
import { seedDatabase } from '@budget/fixtures/seed';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-09-17';
const webDir = mkdtempSync(join(tmpdir(), 'budget-assets-debts-api-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};

const appOn = (db: Db) => createApp({ webDir, auth: signedIn, ledger: { db, today: () => TODAY } });
const getFrom = async (app: ReturnType<typeof appOn>, path: string) => {
  const res = await app.request(`/api${path}`);
  return { status: res.status, body: (await res.json()) as any };
};

describe('GET /api/assets-debts-history with controlled accounts', () => {
  let app: ReturnType<typeof appOn>;
  beforeAll(() => {
    const db = createTestDatabase().db;
    db.insert(schema.account)
      .values([
        {
          id: 'giro',
          name: 'Synthetic giro',
          type: 'checking',
          role: 'budget',
          onBudget: true,
          openingDate: '2026-01-01',
          openingBalanceCents: 100_000,
        },
        {
          id: 'loan',
          name: 'Synthetic loan',
          type: 'loan',
          role: 'debt',
          onBudget: false,
          openingDate: '2026-01-01',
          openingBalanceCents: -500_000,
        },
        {
          id: 'card',
          name: 'Synthetic card',
          type: 'credit_card',
          role: 'budget',
          onBudget: true,
          openingDate: '2026-03-15',
          openingBalanceCents: -20_000,
        },
        {
          id: 'purse',
          name: 'Synthetic purse',
          type: 'cash',
          role: 'budget',
          onBudget: true,
          openingDate: '2026-05-01',
          openingBalanceCents: -5_000,
        },
        {
          id: 'vault',
          name: 'Synthetic vault',
          type: 'savings',
          role: 'reserve',
          onBudget: false,
          openingDate: '2026-08-10',
          openingBalanceCents: 250_000,
        },
      ])
      .run();
    app = appOn(db);
  });

  it('reads every month end since the first account, today for the running month', async () => {
    const { status, body } = await getFrom(app, '/assets-debts-history?period=Alles');
    expect(status).toBe(200);
    expect(body.from).toBe('2026-01-01');
    expect(body.to).toBe(TODAY);
    expect(body.months.map((m: any) => m.month)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(body.months[0].date).toBe('2026-01-31');
    expect(body.months.at(-1)).toMatchObject({ date: TODAY, partial: true });
  });

  it('loans, credit cards and a negative cash account are debts; the rest is assets', async () => {
    const { body } = await getFrom(app, '/assets-debts-history?period=Alles');
    const by = (month: string) => body.months.find((m: any) => m.month === month);
    expect(by('2026-01')).toMatchObject({ assetsCents: 100_000, debtsCents: -500_000 });
    expect(by('2026-03')).toMatchObject({ assetsCents: 100_000, debtsCents: -520_000 });
    expect(by('2026-05').debts.map((d: any) => d.accountId)).toEqual(['loan', 'card', 'purse']);
    expect(by('2026-05')).toMatchObject({ assetsCents: 100_000, debtsCents: -525_000 });
    expect(by('2026-08')).toMatchObject({ assetsCents: 350_000, debtsCents: -525_000 });
    expect(by('2026-08').assets.map((a: any) => [a.accountId, a.valueCents])).toEqual([
      ['vault', 250_000],
      ['giro', 100_000],
    ]);
    expect(by('2026-08').debts[0]).toMatchObject({ typeLabel: 'Kredit', valueCents: -500_000 });
  });

  it('assets plus debts equal the net worth of the month and the change is end minus start', async () => {
    const { body } = await getFrom(app, '/assets-debts-history?period=Alles');
    for (const m of body.months) expect(m.assetsCents + m.debtsCents, m.month).toBe(m.netCents);
    expect(body.change).toMatchObject({
      startCents: -400_000,
      endCents: -175_000,
      deltaCents: 225_000,
    });
    expect(body.change.deltaRate).toBeCloseTo(0.5625);
  });

  it('a calendar range limits the months; its start value is the close before the first month', async () => {
    const { body } = await getFrom(app, '/assets-debts-history?period=2026-04..2026-06');
    expect(body.from).toBe('2026-03-31');
    expect(body.months.map((m: any) => m.month)).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(body.change).toMatchObject({ startCents: -420_000, endCents: -425_000 });
  });

  it('rejects future months and unknown periods', async () => {
    expect((await getFrom(app, '/assets-debts-history?period=2026-10..2026-11')).status).toBe(400);
    expect((await getFrom(app, '/assets-debts-history?period=5J')).status).toBe(400);
  });

  it('defaults to everything since the first account', async () => {
    const { body } = await getFrom(app, '/assets-debts-history');
    expect(body.period).toBe('Alles');
  });
});

describe('GET /api/assets-debts-history on the sample ledger', () => {
  let app: ReturnType<typeof appOn>;
  beforeAll(() => {
    const db = createTestDatabase().db;
    seedDatabase(db);
    app = appOn(db);
  });

  it('is the net worth of Vermögen › Nettovermögen: same end value and same start value', async () => {
    for (const period of ['YTD', '1J', 'Alles']) {
      const report = await getFrom(app, `/assets-debts-history?period=${period}`);
      const page = await getFrom(app, `/wealth/networth?period=${period}`);
      expect(report.status, period).toBe(200);
      expect(report.body.change.endCents, period).toBe(page.body.chain.nowCents);
      expect(report.body.change.startCents, period).toBe(page.body.chain.startCents);
      expect(report.body.from, period).toBe(page.body.from);
      expect(report.body.months.at(-1).date, period).toBe(page.body.to);
    }
  }, 60_000);

  it('every month agrees with the net worth history and carries its accounts', async () => {
    const report = await getFrom(app, '/assets-debts-history?period=1J');
    const history = await getFrom(app, '/networth-history?period=1J');
    const net = new Map(history.body.daily.map((d: any) => [d.date, d.netWorthCents]));
    for (const m of report.body.months) {
      if (net.has(m.date)) expect(m.netCents, m.month).toBe(net.get(m.date));
      const sum = [...m.assets, ...m.debts].reduce((a: number, r: any) => a + r.valueCents, 0);
      expect(sum, m.month).toBe(m.netCents);
    }
    const last = report.body.months.at(-1);
    expect(last.debts.length).toBeGreaterThan(0);
    expect(last.debts.every((d: any) => d.valueCents < 0)).toBe(true);
    expect(last.assets.every((a: any) => a.valueCents > 0)).toBe(true);
  }, 60_000);
});

describe('GET /api/assets-debts-history without accounts', () => {
  it('answers with no months', async () => {
    const app = appOn(createTestDatabase().db);
    const { status, body } = await getFrom(app, '/assets-debts-history');
    expect(status).toBe(200);
    expect(body.months).toEqual([]);
    expect(body.change).toMatchObject({ startCents: 0, endCents: 0, deltaRate: null });
  });
});

describe('GET /api/assets-debts-history valuation quality', () => {
  it('execution-priced historical holdings do not mark month ends or the as-of hint as estimated', async () => {
    const db = createTestDatabase().db;
    seedDatabase(db);
    const depot = db
      .select()
      .from(schema.account)
      .all()
      .find((a) => a.type === 'brokerage')!;
    // Synthetic warrant without any quote, held over the end of June only.
    db.insert(schema.security)
      .values({
        id: 'ko-warrant',
        name: 'Synthetic unquoted warrant',
        kind: 'other',
        currency: 'EUR',
        pricesEnabled: false,
      })
      .run();
    db.insert(schema.trade)
      .values([
        {
          id: 'ko-buy',
          securityId: 'ko-warrant',
          accountId: depot.id,
          date: '2026-06-10',
          kind: 'buy',
          unitsE8: 50e8,
          amountCents: 30_000,
        },
        {
          id: 'ko-out',
          securityId: 'ko-warrant',
          accountId: depot.id,
          date: '2026-07-10',
          kind: 'sell',
          unitsE8: -50e8,
          amountCents: 0,
        },
      ])
      .run();
    const app = appOn(db);
    const { status, body } = await getFrom(app, '/assets-debts-history?period=2026-05..2026-08');
    expect(status).toBe(200);
    const flags = Object.fromEntries(body.months.map((m: any) => [m.month, m.incomplete]));
    expect(flags).toEqual({
      '2026-05': false,
      '2026-06': false,
      '2026-07': false,
      '2026-08': false,
    });
    expect(body.incomplete ?? []).toEqual([]);
    // Still the same valuation as the net worth page, including the execution-price fallback.
    const page = await getFrom(app, '/wealth/networth?period=2026-05..2026-08');
    expect(body.change.endCents).toBe(page.body.chain.nowCents);
  }, 60_000);
});
