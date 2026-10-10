import {
  createTestDatabase,
  replaceExposureVersion,
  portfolioSummary,
  undo,
  type Db,
  type PortfolioSummary,
} from '@budget/db';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const webDir = mkdtempSync(join(tmpdir(), 'budget-performance-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
let opened: ReturnType<typeof createTestDatabase>, db: Db;
let signedIn: boolean;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  signedIn = true;
  opened.sqlite.exec(`
    INSERT INTO account (id,name,type,role,on_budget,opening_date) VALUES ('depot','Depot Test','brokerage','investment',0,'2025-12-31');
    INSERT INTO asset_class (id,name) VALUES ('a','Klasse A'),('b','Klasse B');
    INSERT INTO security (id,name,kind,asset_class_id) VALUES ('a','Produkt A','etf','a'),('b','Produkt B','stock','b'),('bench','Vergleich Test','etf',NULL);
    INSERT INTO holding (id,security_id,account_id,as_of,units_e8,cost_basis_cents) VALUES ('ha','a','depot','2025-12-31',100000000,10000),('hb','b','depot','2025-12-31',100000000,10000);
    INSERT INTO price (security_id,date,price_micro,currency,source) VALUES
      ('a','2025-12-31',100000000,'EUR','manual'),('b','2025-12-31',100000000,'EUR','manual'),
      ('a','2026-01-31',110000000,'EUR','manual'),('b','2026-01-31',90000000,'EUR','manual'),
      ('a','2026-02-28',121000000,'EUR','manual'),('b','2026-02-28',90000000,'EUR','manual'),
      ('bench','2025-12-31',100000000,'EUR','manual'),('bench','2026-01-31',105000000,'EUR','manual'),('bench','2026-02-28',110250000,'EUR','manual');
    INSERT INTO trade (id,security_id,account_id,date,kind,units_e8,amount_cents) VALUES ('sell','b','depot','2026-02-01','sell',-100000000,9000);
  `);
  for (const id of ['a', 'b'])
    replaceExposureVersion(
      db,
      id,
      {
        validFrom: '2025-12-31',
        complete: true,
        source: 'synthetic_fixture',
        weights: [{ assetClassId: id, weightBp: 10000 }],
      },
      { actor: 'tester' },
    );
  const auth: AuthGate = {
    requireSession: async (c, next) => (signedIn ? next() : c.json({ error: 'unauthorized' }, 401)),
    originGuard: async (c, next) =>
      c.req.header('origin') === 'https://foreign.invalid'
        ? c.json({ error: 'origin' }, 403)
        : next(),
    requireStepUp: async (_c, next) => next(),
    routes: new Hono(),
  };
  app = createApp({ webDir, auth, ledger: { db, today: () => '2026-02-28' } });
});
afterEach(() => opened.close());
const read = () => app.request('/api/portfolio?period=YTD&view=securities&history=performance');
const readPortfolio = async () =>
  ((await (await read()).json()) as { portfolio: PortfolioSummary }).portfolio;
const readBenchmark = async () =>
  (await (await app.request('/api/portfolio/benchmark')).json()) as { securityId: string | null };
const save = (securityId: string | null, origin?: string) =>
  app.request('/api/portfolio/benchmark', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: JSON.stringify({ securityId }),
  });

it('compares an unheld owner benchmark, uses shared TTWROR and retains a sold class', async () => {
  expect((await save('bench')).status).toBe(200);
  const response = await read();
  expect(response.status).toBe(200);
  const { portfolio } = (await response.json()) as { portfolio: PortfolioSummary };
  const history = portfolio.performanceHistory!;
  expect(history.benchmarkReturn).toBeCloseTo(0.1025);
  expect(portfolio.performance?.ttwror).toBe(
    portfolioSummary(db, { today: '2026-02-28', period: 'YTD' }).performance?.ttwror,
  );
  expect(history.classes.map((c) => [c.name, c.valueCents])).toEqual([
    ['Klasse A', 12100],
    ['Klasse B', 0],
    ['Ohne Anlageklasse', 0],
  ]);
  expect(history.classes[0]?.performance?.ttwror).toBeCloseTo(0.21);
  expect(history.classes[1]?.performance?.ttwror).toBeCloseTo(-0.1);
  expect(history.months.map((m) => m.month)).toEqual(['2026-01', '2026-02']);
  expect(history.years[0]?.rate).toBeCloseTo(portfolio.performance!.ttwror);
  expect(history.classes.reduce((s, c) => s + c.valueCents, 0)).toBe(
    portfolio.performance!.endValueCents,
  );
});

it('persists audited settings with undo/redo, clear, resave after undo and no-op writes', async () => {
  const first = (await (await save('bench')).json()) as { groupId: string };
  expect(
    opened.sqlite
      .prepare("SELECT value FROM app_setting WHERE id='portfolio.benchmark_security_id'")
      .get(),
  ).toEqual({ value: 'bench' });
  const undone = undo(db, { groupId: first.groupId }, { actor: 'user' });
  expect((await readBenchmark()).securityId).toBeNull();
  undo(db, { groupId: undone.groupId }, { actor: 'user' });
  expect((await readBenchmark()).securityId).toBe('bench');
  const clear = (await (await save(null)).json()) as { groupId: string };
  undo(db, { groupId: clear.groupId }, { actor: 'user' });
  expect((await readBenchmark()).securityId).toBe('bench');
  const count = () => opened.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_log').get();
  const before = count();
  await save('bench');
  expect(count()).toEqual(before);
  undo(db, { groupId: first.groupId }, { actor: 'user' });
  expect((await save('a')).status).toBe(200);
  expect((await readBenchmark()).securityId).toBe('a');
});

it('uses the selected historical month end for class values and the benchmark period', async () => {
  await save('bench');
  const response = await app.request(
    '/api/portfolio?period=2026-01..2026-01&view=securities&history=performance',
  );
  expect(response.status).toBe(200);
  const { portfolio } = (await response.json()) as { portfolio: PortfolioSummary };
  const history = portfolio.performanceHistory!;
  expect(history).toMatchObject({ from: '2025-12-31', to: '2026-01-31' });
  expect(history.classes.map((c) => c.valueCents)).toEqual([11000, 9000, 0]);
  expect(history.classes.reduce((sum, c) => sum + c.valueCents, 0)).toBe(20000);
  expect(history.benchmarkReturn).toBeCloseTo(0.05);
  expect(history.classes[0]?.performance?.moneyWeighted).toBeCloseTo(0.1);
  expect(history.classes[1]?.performance?.moneyWeighted).toBeCloseTo(-0.1);
});

it('rejects invalid/deleted ids and cross-origin or unauthenticated writes', async () => {
  expect((await save('unknown')).status).toBe(400);
  opened.sqlite.exec("UPDATE security SET deleted_at=1 WHERE id='bench'");
  expect((await save('bench')).status).toBe(400);
  expect((await save('a', 'https://foreign.invalid')).status).toBe(403);
  signedIn = false;
  expect((await save('a')).status).toBe(401);
  expect((await app.request('/api/portfolio/benchmark')).status).toBe(401);
  expect((await read()).status).toBe(401);
});

it('does not choose an implicit benchmark and retains a deleted selection as unavailable', async () => {
  let portfolio = await readPortfolio();
  expect(portfolio.benchmark).toBeNull();
  expect(portfolio.performanceHistory?.months.every((m) => m.benchmarkGap === 'not_selected')).toBe(
    true,
  );
  await save('bench');
  opened.sqlite.exec("UPDATE security SET deleted_at=1 WHERE id='bench'");
  expect(await (await app.request('/api/portfolio/benchmark')).json()).toEqual({
    securityId: 'bench',
    name: null,
    available: false,
  });
  portfolio = await readPortfolio();
  expect(portfolio.performanceHistory?.benchmarkReturn).toBeNull();
  expect(portfolio.performance?.benchmarkTtwror).toBeNull();
});

it('compares stored foreign quotes in EUR using quote-date FX without rounding price levels to cents', async () => {
  await save('bench');
  opened.sqlite.exec(
    "UPDATE price SET currency='USD' WHERE security_id='bench'; INSERT INTO fx_rate (currency,date,rate_micro) VALUES ('USD','2025-12-31',2000000),('USD','2026-01-01',1000000)",
  );
  const portfolio = await readPortfolio();
  expect(portfolio.performanceHistory?.benchmarkReturn).toBeCloseTo(1.205);
  expect(portfolio.performanceHistory?.months[0]?.benchmarkRate).toBeCloseTo(1.1);
});

it('allows Friday closes for exchange-traded benchmarks but requires the exact date for crypto', async () => {
  await save('bench');
  opened.sqlite.exec(
    "UPDATE price SET date='2026-02-27' WHERE security_id='bench' AND date='2026-02-28'",
  );
  expect((await readPortfolio()).performanceHistory?.benchmarkReturn).toBeCloseTo(0.1025);
  opened.sqlite.exec("UPDATE security SET kind='crypto' WHERE id='bench'");
  const history = (await readPortfolio()).performanceHistory!;
  expect(history.months[1]?.benchmarkGap).toBe('missing_price');
  expect(history.benchmarkReturn).toBeNull();
});

it('reports missing starting/monthly quotes and FX explicitly without hiding portfolio returns', async () => {
  await save('bench');
  opened.sqlite.exec("DELETE FROM price WHERE security_id='bench' AND date='2026-01-31'");
  let portfolio = await readPortfolio();
  expect(portfolio.performanceHistory?.months[0]?.benchmarkGap).toBe('missing_price');
  expect(portfolio.performanceHistory?.benchmarkReturn).toBeNull();
  expect(portfolio.performance?.ttwror).not.toBeNull();
  opened.sqlite.exec("UPDATE price SET currency='USD' WHERE security_id='bench'");
  portfolio = await readPortfolio();
  expect(portfolio.performanceHistory?.months[0]?.benchmarkGap).toBe('missing_fx');
  expect(portfolio.performanceHistory?.benchmarkReturn).toBeNull();
  opened.sqlite.exec("DELETE FROM price WHERE security_id='a' AND date='2025-12-31'");
  // Earlier holding quote gaps do not flag a holding with a usable quote at the report end.
  const response = await read();
  expect(response.status).toBe(200);
  expect(((await response.json()) as { incomplete?: unknown[] }).incomplete ?? []).toEqual([]);
});

it('rolls the setting back when audit insertion fails, and validates report ranges', async () => {
  opened.sqlite.exec(
    "CREATE TRIGGER fail_setting_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;",
  );
  expect((await save('bench')).status).toBe(422);
  const multiple = await app.request('/api/portfolio/benchmarks', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: ['benchmark-ftse'] }),
  });
  expect(multiple.status).toBe(422);
  expect(
    opened.sqlite.prepare("SELECT COUNT(*) AS n FROM security WHERE id LIKE 'benchmark-%'").get(),
  ).toEqual({ n: 0 });

  expect(opened.sqlite.prepare('SELECT COUNT(*) AS n FROM app_setting').get()).toEqual({ n: 0 });
  expect((await app.request('/api/portfolio?history=unknown')).status).toBe(400);
  expect((await app.request('/api/portfolio?history=performance&period=5J')).status).toBe(400);
});

it('persists multiple index selections with audit undo and compares synthetic EUR series', async () => {
  const selected = ['benchmark-ftse', 'benchmark-sp500'];
  const response = await app.request('/api/portfolio/benchmarks', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: selected }),
  });
  expect(response.status).toBe(200);
  const saved = (await response.json()) as { ids: string[]; groupId: string };
  expect(saved.ids).toEqual(selected);
  for (const id of selected)
    opened.sqlite
      .prepare(
        'INSERT INTO price (security_id,date,price_micro,currency,source) VALUES (?,?,?, ?,?)',
      )
      .run(id, '2025-12-31', 100000000, 'EUR', 'manual');
  for (const id of selected) {
    opened.sqlite
      .prepare(
        'INSERT INTO price (security_id,date,price_micro,currency,source) VALUES (?,?,?, ?,?)',
      )
      .run(id, '2026-01-30', 110000000, 'EUR', 'manual');
    opened.sqlite
      .prepare(
        'INSERT INTO price (security_id,date,price_micro,currency,source) VALUES (?,?,?, ?,?)',
      )
      .run(id, '2026-02-27', id === 'benchmark-ftse' ? 121000000 : 99000000, 'EUR', 'manual');
  }
  const report = await readPortfolio();
  expect(report.benchmarks.map((b) => b.index[0]!.benchmark)).toEqual([100, 100]);
  expect(report.benchmarks.map((b) => b.index.at(-1)!.benchmark)).toEqual([121, 99]);
  expect(report.benchmarks[0]!.benchmarkReturn).toBeCloseTo(0.21);
  expect(report.benchmarks[1]!.benchmarkReturn).toBeCloseTo(-0.01);
  expect(await (await app.request('/api/portfolio/benchmarks')).json()).toMatchObject({
    ids: selected,
  });
  undo(db, { groupId: saved.groupId }, { actor: 'tester' });
  expect(await (await app.request('/api/portfolio/benchmarks')).json()).toMatchObject({ ids: [] });
  for (const ids of [['unknown'], ['benchmark-ftse', 'benchmark-ftse']])
    expect(
      (
        await app.request('/api/portfolio/benchmarks', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ids }),
        })
      ).status,
    ).toBe(400);
  signedIn = false;
  expect((await app.request('/api/portfolio/benchmarks')).status).toBe(401);
});

it('uses dated exposure versions for each historical class return period', async () => {
  // Leave one EUR holding and no cashflows so each class contribution is independently literal.
  opened.sqlite.exec(
    "DELETE FROM trade; DELETE FROM holding WHERE security_id='b'; DELETE FROM price WHERE security_id='b';",
  );
  replaceExposureVersion(
    db,
    'a',
    {
      validFrom: '2025-12-31',
      complete: true,
      source: 'synthetic_two_period_fixture',
      weights: [
        { assetClassId: 'a', weightBp: 5_000 },
        { assetClassId: 'b', weightBp: 5_000 },
      ],
    },
    { actor: 'tester' },
  );
  replaceExposureVersion(
    db,
    'a',
    {
      validFrom: '2026-02-01',
      complete: true,
      source: 'synthetic_two_period_fixture',
      weights: [{ assetClassId: 'b', weightBp: 10_000 }],
    },
    { actor: 'tester' },
  );

  const response = await read();
  expect(response.status).toBe(200);
  const { portfolio } = (await response.json()) as { portfolio: PortfolioSummary };
  const history = portfolio.performanceHistory!;
  expect(history).toMatchObject({ from: '2025-12-31', to: '2026-02-28' });
  expect(history.months.map(({ month }) => month)).toEqual(['2026-01', '2026-02']);

  const classA = history.classes.find(({ assetClassId }) => assetClassId === 'a')!;
  const classB = history.classes.find(({ assetClassId }) => assetClassId === 'b')!;
  const monthEndLevels = (index: typeof classA.index) => {
    const points = index.filter(({ date }) => date === '2026-01-31' || date === '2026-02-28');
    expect(points.map(({ date }) => date)).toEqual(['2026-01-31', '2026-02-28']);
    return points.map(({ portfolio: level }) => level);
  };

  // The Feb 1 reclassification transfers the carried 5,500 cents without return;
  // the Feb 28 quote then adds 10% to B's 11,000-cent post-transfer base.
  expect(classA.valueCents).toBe(0);
  expect(classB.valueCents).toBe(12_100);
  expect(classA).toMatchObject({ currentHolding: false });
  expect(classB).toMatchObject({ currentHolding: true });
  const levelsA = monthEndLevels(classA.index);
  const levelsB = monthEndLevels(classB.index);
  expect(levelsA[0]).toBeCloseTo(110);
  expect(levelsA[1]).toBeCloseTo(110);
  expect(levelsB[0]).toBeCloseTo(110);
  expect(levelsB[1]).toBeCloseTo(121);
  expect(classA.performance?.ttwror).toBeCloseTo(0.1);
  expect(classB.performance?.ttwror).toBeCloseTo(0.21);
  expect(history.classes.reduce((sum, cls) => sum + cls.valueCents, 0)).toBe(12_100);
});

it('keeps zero-valued held classes current even outside the allocation universe', async () => {
  opened.sqlite.exec(
    "UPDATE security SET allocation_included=0 WHERE id='a'; UPDATE price SET price_micro=1 WHERE security_id='a';",
  );
  const portfolio = await readPortfolio();
  expect(portfolio.classes.some((c) => c.assetClassId === 'a')).toBe(false);
  expect(portfolio.performanceHistory?.classes.find((c) => c.assetClassId === 'a')).toMatchObject({
    valueCents: 0,
    currentHolding: true,
  });
  expect(portfolio.performanceHistory?.classes.find((c) => c.assetClassId === 'b')).toMatchObject({
    valueCents: 0,
    currentHolding: false,
  });
});
