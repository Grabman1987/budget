import {
  createTestDatabase,
  portfolioSummary,
  schema,
  setManualPrice,
  upsertFxRate,
  undo,
  openDatabase,
  type PortfolioSummary,
} from '@budget/db';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createLedgerApi } from './index';
import { Hono } from 'hono';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-09-20';
const LEGACY = '/portfolio?period=Alles&view=securities&history=performance';
const OPT_IN = `${LEGACY}&provenance=valuation-v1`;
const opened: Array<ReturnType<typeof createTestDatabase>> = [];

afterEach(() => {
  for (const database of opened.splice(0)) database.close();
});

function fixture(options: { usd?: boolean; empty?: boolean; from?: string } = {}) {
  const database = createTestDatabase();
  opened.push(database);
  const { db, sqlite } = database;
  const from = options.from ?? '2026-09-18';
  if (!options.empty) {
    db.insert(schema.account)
      .values({
        id: 'depot',
        name: 'Musterdepot',
        type: 'brokerage',
        role: 'investment',
        onBudget: false,
        openingDate: from,
      })
      .run();
    db.insert(schema.security)
      .values({
        id: 'security',
        name: 'Musterwertpapier',
        kind: 'stock',
        currency: options.usd ? 'USD' : 'EUR',
      })
      .run();
    db.insert(schema.holding)
      .values({
        id: 'holding',
        accountId: 'depot',
        securityId: 'security',
        asOf: from,
        unitsE8: 100000000,
        costBasisCents: 10000,
      })
      .run();
    db.insert(schema.price)
      .values(
        options.usd
          ? [
              {
                securityId: 'security',
                date: from,
                priceMicro: 120000000,
                currency: 'USD',
                source: 'manual',
              },
            ]
          : [
              {
                securityId: 'security',
                date: from,
                priceMicro: 100000000,
                currency: 'EUR',
                source: 'manual',
              },
              {
                securityId: 'security',
                date: TODAY,
                priceMicro: 114000000,
                currency: 'EUR',
                source: 'manual',
              },
            ],
      )
      .run();
    if (options.usd)
      db.insert(schema.fxRate)
        .values([
          { currency: 'USD', date: from, rateMicro: 950000, source: 'ecb' },
          { currency: 'USD', date: '2026-09-19', rateMicro: 950000, source: 'ecb' },
        ])
        .run();
  }
  const api = createLedgerApi({
    db,
    today: () => TODAY,
    bankSync: null,
    stepUp: async (_c, next) => next(),
  });
  // Exact selected-table contents, not a claim about the entire DB or auth subsystem.
  const snapshot = () =>
    JSON.stringify(
      [
        'account',
        'security',
        'holding',
        'trade',
        'price',
        'fx_rate',
        'booking',
        'booking_split',
        'valuation',
        'audit_log',
        'investment_preference',
      ].map((table) => [table, sqlite.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()]),
    );
  return { ...database, api, snapshot };
}

type Answer = { portfolio: PortfolioSummary & { valuationProvenance?: unknown } };

it('keeps the no-opt-in response byte-identical to the legacy summary with no metadata or writes', async () => {
  const f = fixture();
  const before = f.snapshot();
  const summary = portfolioSummary(f.db, {
    today: TODAY,
    period: 'Alles',
    view: 'securities',
    includePerformanceHistory: true,
  });
  expect(summary.performance).toMatchObject({
    from: '2026-09-18',
    to: TODAY,
    days: 2,
    startValueCents: 10000,
    endValueCents: 11400,
    contributionsCents: 0,
    gainCents: 1400,
  });
  expect(summary.performance?.ttwror).toBeCloseTo(0.14, 12);
  const response = await f.api.request(LEGACY);
  expect(response.status).toBe(200);
  const text = await response.text();
  expect(text).toBe(JSON.stringify({ portfolio: summary }));
  expect((JSON.parse(text) as Answer).portfolio).not.toHaveProperty('valuationProvenance');
  expect(await (await f.api.request(LEGACY)).text()).toBe(text);
  expect(f.snapshot()).toBe(before);
});

it('adds only opted-in closing-valuation provenance after successful literal EUR performance', async () => {
  const f = fixture();
  const before = f.snapshot();
  const legacy = await (await f.api.request(LEGACY)).text();
  const response = await f.api.request(OPT_IN);
  expect(response.status).toBe(200);
  const body = (await response.json()) as Answer;
  expect(body.portfolio.valueCents).toBe(11400);
  expect(body.portfolio.performance).toMatchObject({
    from: '2026-09-18',
    to: TODAY,
    days: 2,
    startValueCents: 10000,
    endValueCents: 11400,
    gainCents: 1400,
    contributionsCents: 0,
  });
  expect(body.portfolio.performance?.ttwror).toBeCloseTo(0.14, 12);
  // Existing successful financial assertions above must precede the meaningful metadata RED.
  expect(body.portfolio).toHaveProperty('valuationProvenance');
  expect(body.portfolio.valuationProvenance).toMatchObject({
    version: 'valuation-v1',
    scope: 'securities-closing-valuations',
    status: 'observed',
    window: { from: '2026-09-18', to: TODAY },
    limits: { runs: 256, bytes: 65536 },
    coverage: {
      calendarDays: '3',
      observedPositionDays: '3',
      retainedPositionDays: '3',
      omittedPositionDays: '0',
      complete: true,
      truncated: false,
    },
    excludes: ['flows', 'fees-taxes', 'benchmarks', 'cash', 'class-sleeves'],
  });
  const { valuationProvenance, ...legacyPortfolio } = body.portfolio;
  expect(valuationProvenance).toBeDefined();
  expect(JSON.stringify({ ...body, portfolio: legacyPortfolio })).toBe(legacy);
  expect(f.snapshot()).toBe(before);
});

it('records the actual selected quote and .95 FX dates without a second valuation or current-date fiction', async () => {
  const f = fixture({ usd: true });
  const before = f.snapshot();
  const response = await f.api.request(OPT_IN);
  expect(response.status).toBe(200);
  const body = (await response.json()) as Answer;
  // 120 USD at the stored .95 EUR/USD rate is independently 114 EUR.
  expect(body.portfolio.valueCents).toBe(11400);
  expect(body.portfolio.performance).toMatchObject({
    from: '2026-09-18',
    to: TODAY,
    days: 2,
    startValueCents: 11400,
    endValueCents: 11400,
    gainCents: 0,
  });
  expect(body.portfolio.performanceHistory?.dailyValues).toEqual([
    { date: '2026-09-18', valueCents: 11400, depositsCents: 0, withdrawalsCents: 0 },
    { date: '2026-09-19', valueCents: 11400, depositsCents: 0, withdrawalsCents: 0 },
    { date: TODAY, valueCents: 11400, depositsCents: 0, withdrawalsCents: 0 },
  ]);
  expect(body.portfolio.valuationProvenance).toMatchObject({
    window: { from: '2026-09-18', to: TODAY },
    coverage: { observedRuns: '2', retainedRuns: 2, omittedRuns: '0' },
    runs: [
      {
        accountId: 'depot',
        securityId: 'security',
        from: '2026-09-18',
        to: '2026-09-18',
        days: '1',
        kind: 'quote',
        quality: 'exact',
        date: '2026-09-18',
        currency: 'USD',
        source: 'manual',
        lookAhead: false,
        fx: { kind: 'rate', date: '2026-09-18', source: 'ecb' },
      },
      {
        accountId: 'depot',
        securityId: 'security',
        from: '2026-09-19',
        to: TODAY,
        days: '2',
        kind: 'quote',
        quality: 'exact',
        date: '2026-09-18',
        currency: 'USD',
        source: 'manual',
        lookAhead: false,
        fx: { kind: 'rate', date: '2026-09-19', source: 'ecb' },
      },
    ],
  });
  expect(f.snapshot()).toBe(before);
});

it('bounds observations to the actual selected month instead of spending the cap on earlier history', async () => {
  const f = fixture({ from: '2026-07-20' });
  const before = f.snapshot();
  const response = await f.api.request(
    '/portfolio?period=1M&view=securities&history=performance&provenance=valuation-v1',
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as Answer;
  expect(body.portfolio.performance).toMatchObject({
    from: '2026-08-20',
    to: TODAY,
    days: 31,
    startValueCents: 10000,
    endValueCents: 11400,
    gainCents: 1400,
  });
  expect(body.portfolio.valuationProvenance).toMatchObject({
    window: { from: '2026-08-20', to: TODAY },
    coverage: { calendarDays: '32', observedPositionDays: '32', retainedPositionDays: '32' },
  });
  expect(f.snapshot()).toBe(before);
});

it('keeps missing historical quote FX as the same 503 rather than a successful partial metadata response', async () => {
  const f = fixture({ usd: true });
  f.sqlite.exec(
    "DELETE FROM fx_rate; INSERT INTO fx_rate(currency,date,rate_micro,source) VALUES ('USD','2026-09-21',950000,'ecb')",
  );
  const before = f.snapshot();
  const legacy = await f.api.request(LEGACY);
  const optedIn = await f.api.request(OPT_IN);
  expect(legacy.status).toBe(503);
  expect(optedIn.status).toBe(503);
  const oldText = await legacy.text();
  expect(await optedIn.text()).toBe(oldText);
  expect(JSON.parse(oldText)).toMatchObject({
    error: 'valuation_unavailable',
    missingFxCurrencies: ['USD'],
  });
  expect(JSON.parse(oldText)).not.toHaveProperty('portfolio');
  expect(f.snapshot()).toBe(before);
});

it('represents absent history explicitly without inventing a valuation window or complete return', async () => {
  const f = fixture({ empty: true });
  const before = f.snapshot();
  const response = await f.api.request(OPT_IN);
  expect(response.status).toBe(200);
  const body = (await response.json()) as Answer;
  expect(body.portfolio.performance).toBeNull();
  expect(body.portfolio.valuationProvenance).toMatchObject({
    version: 'valuation-v1',
    status: 'no-history',
    window: null,
    runs: [],
    coverage: {
      calendarDays: '0',
      observedPositionDays: '0',
      retainedPositionDays: '0',
      omittedPositionDays: '0',
      observedRuns: '0',
      retainedRuns: 0,
      omittedRuns: '0',
      complete: false,
      truncated: false,
    },
  });
  expect(f.snapshot()).toBe(before);
});

it.each([
  '/portfolio?period=Alles&view=securities&history=performance&provenance=valuation-v2',
  '/portfolio?period=Alles&view=depot&history=performance&provenance=valuation-v1',
  '/portfolio?period=Alles&view=securities&provenance=valuation-v1',
  '/portfolio?period=Alles&view=securities&history=contributions&provenance=valuation-v1',
])(
  'rejects unsupported explicit provenance before expensive or failing valuation: %s',
  async (path) => {
    const f = fixture({ usd: true });
    f.sqlite.exec('DELETE FROM fx_rate');
    const before = f.snapshot();
    expect((await f.api.request(LEGACY)).status).toBe(503);
    const response = await f.api.request(path);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid' });
    expect(f.snapshot()).toBe(before);
  },
);

it('caches whole opted-in answers separately and invalidates values and original source facts together', async () => {
  const f = fixture({ usd: true });
  const first = await (await f.api.request(OPT_IN)).text();
  expect(await (await f.api.request(OPT_IN)).text()).toBe(first);
  expect((JSON.parse(first) as Answer).portfolio.performance?.endValueCents).toBe(11400);
  const legacy = (await (await f.api.request(LEGACY)).json()) as Answer;
  expect(legacy.portfolio).not.toHaveProperty('valuationProvenance');
  const saved = setManualPrice(
    f.db,
    { securityId: 'security', date: TODAY, priceMicro: 126000000, currency: 'USD' },
    { actor: 'synthetic' },
  );
  const changed = (await (await f.api.request(OPT_IN)).json()) as Answer;
  expect(changed.portfolio.performance?.endValueCents).toBe(11970);
  expect(changed.portfolio.valuationProvenance).toMatchObject({
    runs: expect.arrayContaining([
      expect.objectContaining({ date: TODAY, source: 'manual', from: TODAY, to: TODAY }),
    ]),
  });
  undo(f.db, { groupId: saved.groupId }, { actor: 'synthetic' });
  const undone = (await (await f.api.request(OPT_IN)).json()) as Answer;
  expect(undone.portfolio.performance?.endValueCents).toBe(11400);
  expect(undone.portfolio.valuationProvenance).toMatchObject({
    runs: expect.arrayContaining([
      expect.objectContaining({ date: '2026-09-18', from: '2026-09-19', to: TODAY }),
    ]),
  });
  upsertFxRate(f.db, { currency: 'USD', date: TODAY, rateMicro: 900000, source: 'manual' });
  const fx = (await (await f.api.request(OPT_IN)).json()) as Answer;
  expect(fx.portfolio.performance?.endValueCents).toBe(10800);
  expect(fx.portfolio.valuationProvenance).toMatchObject({
    runs: expect.arrayContaining([
      expect.objectContaining({
        from: TODAY,
        to: TODAY,
        fx: { kind: 'rate', date: TODAY, source: 'manual' },
      }),
    ]),
  });
  const beforeRollback = await (await f.api.request(OPT_IN)).text();
  f.sqlite.exec('BEGIN');
  try {
    upsertFxRate(f.db, { currency: 'USD', date: TODAY, rateMicro: 800000, source: 'import' });
  } finally {
    f.sqlite.exec('ROLLBACK');
  }
  expect(await (await f.api.request(OPT_IN)).text()).toBe(beforeRollback);
});

it('invalidates the same whole-response cache after another connection commits', async () => {
  const f = fixture({ usd: true });
  const directory = mkdtempSync(join(tmpdir(), 'budget-provenance-512-'));
  const path = join(directory, 'synthetic.sqlite');
  writeFileSync(path, f.sqlite.serialize());
  const main = openDatabase(path),
    writer = openDatabase(path);
  try {
    const api = createLedgerApi({
      db: main.db,
      today: () => TODAY,
      bankSync: null,
      stepUp: async (_c, next) => next(),
    });
    const read = async () => (await (await api.request(OPT_IN)).json()) as Answer;
    expect((await read()).portfolio.performance?.endValueCents).toBe(11400);
    upsertFxRate(writer.db, { currency: 'USD', date: TODAY, rateMicro: 900000, source: 'import' });
    const actual = await read();
    expect(actual.portfolio.performance?.endValueCents).toBe(10800);
    expect(actual.portfolio.valuationProvenance).toMatchObject({
      runs: expect.arrayContaining([
        expect.objectContaining({
          from: TODAY,
          to: TODAY,
          fx: { kind: 'rate', date: TODAY, source: 'import' },
        }),
      ]),
    });
  } finally {
    writer.close();
    main.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('keeps the opt-in behind the existing session boundary and no-store header without read writes', async () => {
  const f = fixture();
  let signedIn = false;
  const auth: AuthGate = {
    routes: new Hono(),
    requireSession: async (c, next) => (signedIn ? next() : c.json({ error: 'unauthorized' }, 401)),
    originGuard: async (_c, next) => next(),
    requireStepUp: async (_c, next) => next(),
  };
  const app = createApp({
    webDir: 'apps/web/dist',
    auth,
    ledger: { db: f.db, today: () => TODAY },
  });
  const before = f.snapshot();
  expect((await app.request('/api' + OPT_IN)).status).toBe(401);
  signedIn = true;
  const response = await app.request('/api' + OPT_IN);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(((await response.json()) as Answer).portfolio.performance?.endValueCents).toBe(11400);
  expect(f.snapshot()).toBe(before);
});
