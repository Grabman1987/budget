import { afterEach, expect, it } from 'vitest';
import { createTestDatabase } from '../client';
import { schema } from '../index';
import { eachDay } from '@budget/domain';
import { MissingFxRateError } from './errors';
import { portfolioSummary } from './portfolio-summary';
import { rateTable, valuationSeries, valuationProvenanceCollector } from './portfolio';

const resources: ReturnType<typeof createTestDatabase>[] = [];
afterEach(() => {
  for (const opened of resources.splice(0)) opened.close();
});
function seed(options: { to?: string; unicode?: boolean } = {}) {
  const opened = createTestDatabase();
  resources.push(opened);
  const from = '2026-01-01',
    to = options.to ?? '2026-09-14';
  const a = options.unicode ? '界'.repeat(64) : 'a';
  const s = options.unicode ? '語'.repeat(64) : 's';
  opened.db
    .insert(schema.account)
    .values({
      id: a,
      name: 'Musterdepot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      openingDate: from,
    })
    .run();
  opened.db
    .insert(schema.security)
    .values({ id: s, name: 'Musterwertpapier', kind: 'stock' })
    .run();
  opened.db
    .insert(schema.holding)
    .values({
      id: 'h',
      accountId: a,
      securityId: s,
      asOf: from,
      unitsE8: 100000000,
      costBasisCents: 10000,
    })
    .run();
  opened.db
    .insert(schema.price)
    .values(
      eachDay(from, to).map((date) => ({
        securityId: s,
        date,
        priceMicro: 100000000,
        currency: 'EUR',
        source: 'manual' as const,
      })),
    )
    .run();
  return { ...opened, from, to, a, s };
}

it('retains the first256 original runs and counts all257 days without changing a cent', () => {
  const f = seed();
  const before = f.sqlite.serialize();
  const old = portfolioSummary(f.db, {
    today: f.to,
    period: 'Alles',
    view: 'securities',
    includePerformanceHistory: true,
  });
  const actual = portfolioSummary(f.db, {
    today: f.to,
    period: 'Alles',
    view: 'securities',
    includePerformanceHistory: true,
    valuationProvenance: 'valuation-v1',
  });
  expect(actual.performance).toMatchObject({
    from: '2026-01-01',
    to: '2026-09-14',
    days: 256,
    startValueCents: 10000,
    endValueCents: 10000,
    gainCents: 0,
  });
  const { valuationProvenance: metadata, ...without } = actual;
  expect(without).toEqual(old);
  expect(metadata?.coverage).toEqual({
    calendarDays: '257',
    observedPositionDays: '257',
    retainedPositionDays: '256',
    omittedPositionDays: '1',
    observedRuns: '257',
    retainedRuns: 256,
    omittedRuns: '1',
    unknownSourceLabelPositionDays: '0',
    complete: false,
    truncated: true,
    runLimit: true,
    byteLimit: false,
  });
  expect(metadata?.runs[0]).toMatchObject({ from: '2026-01-01', to: '2026-01-01', days: '1' });
  expect(metadata?.runs.at(-1)).toMatchObject({ from: '2026-09-13', to: '2026-09-13', days: '1' });
  expect(
    Buffer.byteLength(JSON.stringify({ valuationProvenance: metadata }), 'utf8'),
  ).toBeLessThanOrEqual(65536);
  expect(f.sqlite.serialize().equals(before)).toBe(true);
});

it.each([
  ['1M', '2026-09-14', '2026-08-14', '2026-09-14', 31, '32'],
  ['3M', '2026-09-14', '2026-06-14', '2026-09-14', 92, '93'],
  ['Alles', '2026-09-14', '2026-01-01', '2026-09-14', 256, '257'],
  ['2026-08..2026-08', '2026-09-14', '2026-07-31', '2026-08-31', 31, '32'],
  ['1M', '2026-01-03', '2026-01-01', '2026-01-03', 2, '3'],
] as const)(
  'uses the actual %s window ending at %s including the first closing day',
  (period, today, from, to, returnDays, closingDays) => {
    const f = seed();
    const actual = portfolioSummary(f.db, {
      today,
      period,
      view: 'securities',
      includePerformanceHistory: true,
      valuationProvenance: 'valuation-v1',
    });
    expect(actual.performance).toMatchObject({
      from,
      to,
      days: returnDays,
      startValueCents: 10000,
      endValueCents: 10000,
    });
    expect(actual.valuationProvenance?.window).toEqual({ from, to });
    expect(actual.valuationProvenance?.coverage.calendarDays).toBe(closingDays);
    expect(actual.valuationProvenance?.coverage.observedPositionDays).toBe(closingDays);
    expect(actual.valuationProvenance?.runs[0]?.from).toBe(from);
  },
);

it('applies the64KiB UTF8 property-envelope cap to whole-prefix runs independently of the256 cap', () => {
  const f = seed({ to: '2026-07-19', unicode: true });
  const actual = portfolioSummary(f.db, {
    today: f.to,
    period: 'Alles',
    view: 'securities',
    includePerformanceHistory: true,
    valuationProvenance: 'valuation-v1',
  });
  expect(actual.performance?.endValueCents).toBe(10000);
  const metadata = actual.valuationProvenance!;
  expect(metadata.coverage.observedRuns).toBe('200');
  expect(metadata.coverage.runLimit).toBe(false);
  expect(metadata.coverage.byteLimit).toBe(true);
  // Independently serialized literal wire records below determine the exact byte prefix;
  // they do not call the collector or a pricing/date/valuation helper.
  const literalRuns = eachDay('2026-01-01', '2026-07-19').map((day) => ({
    accountId: '界'.repeat(64),
    securityId: '語'.repeat(64),
    kind: 'quote',
    quality: 'exact',
    date: day,
    currency: 'EUR',
    source: 'manual',
    lookAhead: false,
    fx: { kind: 'identity' },
    from: day,
    to: day,
    days: '1',
  }));
  const literal = (count: number) => ({
    valuationProvenance: {
      version: 'valuation-v1',
      scope: 'securities-closing-valuations',
      status: 'observed',
      window: { from: '2026-01-01', to: '2026-07-19' },
      limits: { runs: 256, bytes: 65536 },
      coverage: {
        calendarDays: '200',
        observedPositionDays: '200',
        retainedPositionDays: String(count),
        omittedPositionDays: String(200 - count),
        observedRuns: '200',
        retainedRuns: count,
        omittedRuns: String(200 - count),
        unknownSourceLabelPositionDays: '0',
        complete: false,
        truncated: true,
        runLimit: false,
        byteLimit: true,
      },
      excludes: ['flows', 'fees-taxes', 'benchmarks', 'cash', 'class-sleeves'],
      runs: literalRuns.slice(0, count),
    },
  });
  // Fixed independently from the contract's complete UTF8 wire envelope, including all counters.
  expect(Buffer.byteLength(JSON.stringify(literal(108)), 'utf8')).toBeLessThanOrEqual(65536);
  expect(Buffer.byteLength(JSON.stringify(literal(109)), 'utf8')).toBeGreaterThan(65536);
  expect(metadata.coverage.retainedRuns).toBe(108);
  expect(metadata.coverage.retainedPositionDays).toBe('108');
  expect(metadata.coverage.omittedPositionDays).toBe('92');
  expect(metadata.runs).toEqual(literalRuns.slice(0, 108));
  expect(
    Buffer.byteLength(JSON.stringify({ valuationProvenance: metadata }), 'utf8'),
  ).toBeLessThanOrEqual(65536);
});

it('does not coalesce across zero-unit gaps or discard sold and negative historical positions', () => {
  const f = seed({ to: '2026-01-03' });
  f.sqlite.exec(
    "DELETE FROM price WHERE date>'2026-01-01'; INSERT INTO holding(id,account_id,security_id,as_of,units_e8,cost_basis_cents) VALUES ('zero','a','s','2026-01-02',0,0),('negative','a','s','2026-01-03',-100000000,NULL)",
  );
  const collector = valuationProvenanceCollector({ from: f.from, to: f.to });
  const series = valuationSeries(f.db, { from: f.from, to: f.to }, { observe: collector.observe });
  expect(series.totalCents).toEqual([10000, 0, -10000]);
  expect(collector.finish().runs.map((r) => [r.from, r.to, r.days])).toEqual([
    ['2026-01-01', '2026-01-01', '1'],
    ['2026-01-03', '2026-01-03', '1'],
  ]);
  f.sqlite.exec("UPDATE holding SET units_e8=0 WHERE id='negative'");
  const sold = valuationProvenanceCollector({ from: f.from, to: f.to });
  expect(
    valuationSeries(f.db, { from: f.from, to: f.to }, { observe: sold.observe }).totalCents,
  ).toEqual([10000, 0, 0]);
  expect(sold.finish().coverage.observedPositionDays).toBe('1');
  expect(sold.finish().runs[0]?.from).toBe('2026-01-01');
});

it('preserves default rate shapes and marks unknown provider labels without returning their bytes', () => {
  const f = seed({ to: '2026-01-03' });
  f.sqlite.exec(
    "UPDATE price SET currency='USD'; INSERT INTO fx_rate(currency,date,rate_micro,source) VALUES ('USD','2026-01-01',950000,'private-synthetic-label')",
  );
  expect(rateTable(f.db, f.to).get('USD')).toEqual([{ date: '2026-01-01', rateMicro: 950000 }]);
  const actual = portfolioSummary(f.db, {
    today: f.to,
    period: 'Alles',
    view: 'securities',
    includePerformanceHistory: true,
    valuationProvenance: 'valuation-v1',
  });
  expect(actual.performance?.endValueCents).toBe(9500);
  expect(actual.valuationProvenance?.coverage).toMatchObject({
    complete: false,
    truncated: false,
    unknownSourceLabelPositionDays: '3',
  });
  expect(actual.valuationProvenance?.runs[0]?.fx).toEqual({
    kind: 'rate',
    date: '2026-01-01',
    source: null,
  });
  expect(JSON.stringify(actual.valuationProvenance)).not.toContain('private-synthetic-label');
});

it('does not infer historical cost method from the current FIFO preference', () => {
  const f = seed({ to: '2026-01-03' });
  f.sqlite.exec(
    "DELETE FROM price; INSERT INTO investment_preference(id,cost_method) VALUES ('portfolio','fifo')",
  );
  const actual = portfolioSummary(f.db, {
    today: f.to,
    period: 'Alles',
    view: 'securities',
    includePerformanceHistory: true,
    valuationProvenance: 'valuation-v1',
  });
  expect(actual.costMethod).toBe('fifo');
  expect(actual.performance?.endValueCents).toBe(10000);
  expect(actual.valuationProvenance?.runs).toEqual([
    {
      accountId: 'a',
      securityId: 's',
      kind: 'cost',
      quality: 'estimated',
      date: null,
      currency: 'EUR',
      source: null,
      lookAhead: false,
      fx: { kind: 'identity' },
      costMethod: 'average',
      from: '2026-01-01',
      to: '2026-01-03',
      days: '3',
    },
  ]);
  expect(actual.valuationProvenance?.coverage.complete).toBe(true);
});

it('documents missing historical cost FX as unavailable instead of describing the internal zero placeholder as an observed value', () => {
  const f = seed({ to: '2026-01-03' });
  f.sqlite.exec(
    "DELETE FROM price; UPDATE account SET currency='USD'; INSERT INTO fx_rate(currency,date,rate_micro,source) VALUES ('USD','2026-01-03',950000,'ecb')",
  );
  // The existing summary requires a documented FX rate for its current cost anchor.
  // Before a later documented snapshot it must keep rejecting this original fixture.
  expect(() =>
    portfolioSummary(f.db, {
      today: f.to,
      period: 'Alles',
      view: 'securities',
      includePerformanceHistory: true,
    }),
  ).toThrow(MissingFxRateError);
  expect(() =>
    portfolioSummary(f.db, {
      today: f.to,
      period: 'Alles',
      view: 'securities',
      includePerformanceHistory: true,
      valuationProvenance: 'valuation-v1',
    }),
  ).toThrow(MissingFxRateError);
  // Same units/native cost on Jan3, with the genuinely stored Jan3 rate: current
  // cost is now documented while Jan1/2 daily fallback still has no historical FX.
  f.db
    .insert(schema.holding)
    .values({
      id: 'later-documented-cost',
      accountId: 'a',
      securityId: 's',
      asOf: '2026-01-03',
      unitsE8: 100000000,
      costBasisCents: 10000,
    })
    .run();
  const actual = portfolioSummary(f.db, {
    today: f.to,
    period: 'Alles',
    view: 'securities',
    includePerformanceHistory: true,
    valuationProvenance: 'valuation-v1',
  });
  expect(actual.performanceHistory?.dailyValues.map((day) => day.valueCents)).toEqual([0, 0, 9500]);
  expect(actual.valuationProvenance?.runs).toEqual([
    {
      accountId: 'a',
      securityId: 's',
      kind: 'cost',
      quality: 'missing',
      date: null,
      currency: 'USD',
      source: null,
      lookAhead: false,
      fx: { kind: 'missing' },
      costMethod: 'average',
      missing: 'fx',
      from: '2026-01-01',
      to: '2026-01-02',
      days: '2',
    },
    {
      accountId: 'a',
      securityId: 's',
      kind: 'cost',
      quality: 'estimated',
      date: null,
      currency: 'USD',
      source: null,
      lookAhead: false,
      fx: { kind: 'rate', date: '2026-01-03', source: 'ecb' },
      costMethod: 'average',
      from: '2026-01-03',
      to: '2026-01-03',
      days: '1',
    },
  ]);
  expect(actual.valuationProvenance?.coverage.complete).toBe(true);
});
