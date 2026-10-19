import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../client';
import { depotComparison } from './portfolio-depots';

let opened: ReturnType<typeof createTestDatabase>;
beforeEach(() => {
  opened = createTestDatabase();
});
afterEach(() => opened.close());

function fixture(from: string, kind: 'etf' | 'crypto', currency = 'EUR') {
  opened.sqlite
    .prepare(
      `INSERT INTO account (id,name,type,role,on_budget,opening_date)
       VALUES ('depot','Synthetic depot','brokerage','investment',0,?)`,
    )
    .run(from);
  opened.sqlite
    .prepare(`INSERT INTO security (id,name,kind,currency) VALUES ('held','Synthetic holding',?,?)`)
    .run(kind, currency);
  opened.sqlite
    .prepare(
      `INSERT INTO holding (id,security_id,account_id,as_of,units_e8,cost_basis_cents)
       VALUES ('opening','held','depot',?,100000000,10000)`,
    )
    .run(from);
  opened.sqlite
    .prepare(
      `INSERT INTO price (security_id,date,price_micro,currency,source)
       VALUES ('held',?,100000000,?,'manual')`,
    )
    .run(from, currency);
}

function read(today: string) {
  const before = opened.sqlite.prepare('SELECT total_changes() AS changes').get();
  const result = depotComparison(opened.db, { today, period: 'Alles' });
  expect(opened.sqlite.prepare('SELECT total_changes() AS changes').get()).toEqual(before);
  expect(result.total?.performance?.contributionsCents).toBe(0);
  return result;
}

describe('#543 depot caller quote agreement', () => {
  it('keeps the actual unquoted terminal date as a gap in both line and period', () => {
    fixture('2026-03-02', 'etf');
    const result = read('2026-03-03');
    expect(result.window).toEqual({ from: '2026-03-02', to: '2026-03-03' });
    expect(result.benchmarkIndex).toEqual([
      { date: '2026-03-02', level: 100 },
      { date: '2026-03-03', level: null },
    ]);
    expect(result.total?.performance).toMatchObject({
      benchmarkTtwror: null,
      startValueCents: 10_000,
      endValueCents: 10_000,
      gainCents: 0,
      ttwror: 0,
    });
  });

  it.each(['etf', 'crypto'] as const)('retains source-kind weekend eligibility (%s)', (kind) => {
    fixture('2026-03-06', kind);
    const result = read('2026-03-08');
    expect(result.benchmarkIndex?.map((point) => point.level)).toEqual(
      kind === 'etf' ? [100, 100] : [100, null],
    );
    expect(result.total?.performance?.benchmarkTtwror).toBe(kind === 'etf' ? 0 : null);
    expect(result.total?.performance).toMatchObject({
      startValueCents: 10_000,
      endValueCents: 10_000,
      gainCents: 0,
      ttwror: 0,
    });
  });

  it('normalizes the line and period with documented historical EUR-per-USD FX', () => {
    fixture('2026-03-02', 'etf', 'USD');
    opened.sqlite.exec(`
      INSERT INTO price (security_id,date,price_micro,currency,source)
        VALUES ('held','2026-03-03',110000000,'USD','manual');
      INSERT INTO fx_rate (currency,date,rate_micro) VALUES
        ('USD','2026-03-02',2000000),('USD','2026-03-03',1000000);
    `);
    const result = read('2026-03-03');
    // One unit: USD 100 × 2 EUR/USD = EUR 200; USD 110 × 1 EUR/USD = EUR 110.
    expect(result.benchmarkIndex?.map((point) => point.level)).toEqual([100, 55]);
    expect(result.total?.performance?.benchmarkTtwror).toBeCloseTo(-0.45, 12);
    expect(result.total?.performance?.ttwror).toBeCloseTo(-0.45, 12);
    expect(result.total?.performance).toMatchObject({
      startValueCents: 20_000,
      endValueCents: 11_000,
      gainCents: -9_000,
    });
  });
});
