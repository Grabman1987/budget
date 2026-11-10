import {
  createTestDatabase,
  ensureSignalInstrument,
  lastMarketRun,
  saveStrategyConfiguration,
  SIGNAL_INDEX,
  storedStrategyEvidence,
  strategyConfiguration,
  type OpenedDatabase,
} from '@budget/db';
import { usEquitySessionCompletedAt } from '@budget/domain';
import { MarketError, type MarketSources, type QuoteSource } from '@budget/market';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scheduledSessionsThrough } from '../../../../packages/db/src/repos/strategy-signal-fixture';
import {
  seedStrategyTestPortfolio,
  strategyTestConfiguration,
} from '../../../../packages/db/src/repos/portfolio-strategy-fixture';
import { refreshPrices } from './refresh';
import { refreshMarket } from './timer';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedStrategyTestPortfolio(opened);
});
afterEach(() => opened.close());

const TODAY = '2026-11-09';
const AS_OF = '2026-11-10T12:00:00.000Z';
const ALL = scheduledSessionsThrough('2025-01', '2026-12-31');

const enable = () => {
  saveStrategyConfiguration(
    opened.db,
    { config: strategyTestConfiguration(), revision: strategyConfiguration(opened.db).revision },
    '2026-09-30',
    { actor: 'test', groupId: 'config' },
  );
  ensureSignalInstrument(opened.db);
};

/** A source that only knows the signal series; synthetic closes, nothing from the network. */
function fakeSource(
  id: 'ariva' | 'yfinance',
  mode: 'ok' | 'fail' | 'empty',
  valueOf: (date: string) => number = (date) => (10_000 + ALL.indexOf(date)) * 1_000_000,
) {
  const calls: Array<{ from: string; to: string }> = [];
  const source: QuoteSource = {
    id,
    supports: (ref) => ref.id === SIGNAL_INDEX.id,
    async history(_ref, from, to) {
      calls.push({ from, to });
      if (mode === 'fail') throw new MarketError('timeout');
      if (mode === 'empty') return [];
      return ALL.filter((d) => d >= from && d <= to).map((date) => ({
        date,
        priceMicro: valueOf(date),
      }));
    },
  };
  return { source, calls };
}
const sourcesOf = (primary: QuoteSource, fallback: QuoteSource): MarketSources => ({
  quotes: primary,
  fallbackQuotes: fallback,
  fx: { history: async () => [] },
});
/** The repository stamps rows with the database clock; pin the observation time deterministically. */
const pinObservation = () =>
  opened.sqlite
    .prepare('SELECT date FROM price_audit WHERE security_id = ?')
    .all(SIGNAL_INDEX.id)
    .forEach((row) =>
      opened.sqlite
        .prepare('UPDATE price_audit SET ts = ? WHERE security_id = ? AND date = ?')
        .run(
          new Date(
            Date.parse(usEquitySessionCompletedAt((row as { date: string }).date)) + 5 * 3_600_000,
          ).toISOString(),
          SIGNAL_INDEX.id,
          (row as { date: string }).date,
        ),
    );
const stored = () =>
  opened.sqlite
    .prepare('SELECT source, count(*) AS n FROM price WHERE security_id = ? GROUP BY source')
    .all(SIGNAL_INDEX.id);

describe('signal series capture in the market run', () => {
  it('captures nothing while the strategy is not enabled', async () => {
    const ariva = fakeSource('ariva', 'ok');
    await refreshMarket(
      opened.db,
      sourcesOf(ariva.source, fakeSource('yfinance', 'ok').source),
      TODAY,
    );
    expect(ariva.calls).toEqual([]);
    expect(
      opened.sqlite.prepare('SELECT count(*) AS n FROM security WHERE id = ?').get(SIGNAL_INDEX.id),
    ).toEqual({ n: 0 });
  });

  it('backfills the needed history from Ariva on the first run and then verifies evidence', async () => {
    enable();
    const ariva = fakeSource('ariva', 'ok');
    const yahoo = fakeSource('yfinance', 'ok');
    await refreshMarket(opened.db, sourcesOf(ariva.source, yahoo.source), TODAY);
    expect(ariva.calls[0]).toEqual({ from: '2025-09-05', to: TODAY });
    expect(yahoo.calls).toEqual([]);
    expect(stored()).toEqual([{ source: 'ariva', n: expect.any(Number) }]);
    pinObservation();
    const evidence = storedStrategyEvidence(opened.db, AS_OF);
    expect(evidence.status).toBe('verified');
    expect(evidence.status === 'verified' && evidence.input.source.sourceId).toBe('ariva:72');
    // A second run refetches the evidence window (heals gaps), still ending at the new day.
    await refreshMarket(opened.db, sourcesOf(ariva.source, yahoo.source), '2026-11-10');
    expect(ariva.calls[1]).toMatchObject({ to: '2026-11-10' });
    expect(ariva.calls[1]!.from < '2026-11-01').toBe(true);
  });

  it('falls back to Yahoo when Ariva fails or answers with nothing, and says which delivered', async () => {
    enable();
    for (const mode of ['fail', 'empty'] as const) {
      const ariva = fakeSource('ariva', mode);
      const yahoo = fakeSource('yfinance', 'ok');
      const { prices } = await refreshMarket(
        opened.db,
        sourcesOf(ariva.source, yahoo.source),
        TODAY,
      );
      expect(prices.bySource.yfinance.securities).toBe(1);
      expect(prices.bySource.ariva.rows).toBe(0);
      opened.sqlite.prepare('DELETE FROM price_audit WHERE security_id = ?').run(SIGNAL_INDEX.id);
      opened.sqlite.prepare('DELETE FROM price WHERE security_id = ?').run(SIGNAL_INDEX.id);
    }
    await refreshPrices(
      opened.db,
      sourcesOf(fakeSource('ariva', 'fail').source, fakeSource('yfinance', 'ok').source),
      { today: TODAY },
    );
    pinObservation();
    const evidence = storedStrategyEvidence(opened.db, AS_OF);
    expect(evidence.status === 'verified' && evidence.input.source.sourceId).toBe('yfinance:^NDX');
  });

  it('records a failure in the run protocol and opens an inbox item when both sources fail', async () => {
    enable();
    await refreshMarket(
      opened.db,
      sourcesOf(fakeSource('ariva', 'fail').source, fakeSource('yfinance', 'fail').source),
      TODAY,
    );
    const run = lastMarketRun(opened.db);
    expect(run).toMatchObject({ status: 'failed', priceRows: 0 });
    expect(run?.errorClasses).toContain('timeout');
    expect(
      opened.sqlite
        .prepare("SELECT count(*) AS n FROM inbox_item WHERE kind = 'stale_value' AND ref_id = ?")
        .get(SIGNAL_INDEX.id),
    ).toEqual({ n: 1 });
    expect(storedStrategyEvidence(opened.db, AS_OF)).toMatchObject({
      status: 'unavailable',
      reason: 'no_completed_sessions',
    });
  });

  it('keeps evidence unavailable when the fetched series is incomplete', async () => {
    enable();
    const partial = fakeSource('ariva', 'ok');
    const sparse: QuoteSource = {
      ...partial.source,
      history: async (ref, from, to) =>
        (await partial.source.history(ref, from, to)).filter((q) => q.date !== '2026-07-15'),
    };
    await refreshMarket(opened.db, sourcesOf(sparse, fakeSource('yfinance', 'fail').source), TODAY);
    pinObservation();
    expect(storedStrategyEvidence(opened.db, AS_OF)).toMatchObject({
      reason: 'session_gap',
      missingSessions: ['2026-07-15'],
    });
  });

  it('never stores a session that is not completed yet (partial same-day bar)', async () => {
    enable();
    const ariva = fakeSource('ariva', 'ok');
    // 09.11. 15:00 UTC: the US session of the 9th is still running.
    await refreshPrices(opened.db, sourcesOf(ariva.source, fakeSource('yfinance', 'ok').source), {
      today: TODAY,
      now: new Date('2026-11-09T15:00:00.000Z'),
    });
    expect(
      opened.sqlite
        .prepare('SELECT max(date) AS d FROM price WHERE security_id = ?')
        .get(SIGNAL_INDEX.id),
    ).toEqual({ d: '2026-11-06' });
  });

  it('heals omitted days on the next run without rewriting identical closes', async () => {
    enable();
    const sparse = fakeSource('ariva', 'ok');
    const omit: QuoteSource = {
      ...sparse.source,
      history: async (ref, from, to) =>
        (await sparse.source.history(ref, from, to)).filter((q) => q.date !== '2026-07-15'),
    };
    const yahoo = fakeSource('yfinance', 'fail').source;
    await refreshPrices(opened.db, sourcesOf(omit, yahoo), { today: TODAY });
    const before = opened.sqlite.prepare('SELECT count(*) AS n FROM price_audit').get() as {
      n: number;
    };
    const full = fakeSource('ariva', 'ok');
    await refreshPrices(opened.db, sourcesOf(full.source, yahoo), { today: TODAY });
    expect(full.calls[0]!.from < '2026-07-15').toBe(true);
    const after = opened.sqlite.prepare('SELECT count(*) AS n FROM price_audit').get() as {
      n: number;
    };
    expect(after.n).toBe(before.n + 1);
    pinObservation();
    expect(storedStrategyEvidence(opened.db, AS_OF).status).toBe('verified');
  });

  it('keeps a differing stored close, records the conflict once and blocks the evidence', async () => {
    enable();
    const yahoo = fakeSource('yfinance', 'fail').source;
    await refreshPrices(opened.db, sourcesOf(fakeSource('ariva', 'ok').source, yahoo), {
      today: TODAY,
    });
    pinObservation();
    expect(storedStrategyEvidence(opened.db, AS_OF).status).toBe('verified');
    const changed = fakeSource(
      'ariva',
      'ok',
      (d) => (10_000 + ALL.indexOf(d)) * 1_000_000 + (d === '2026-08-12' ? 10_000 : 0),
    );
    const one = await refreshPrices(opened.db, sourcesOf(changed.source, yahoo), { today: TODAY });
    const two = await refreshPrices(opened.db, sourcesOf(changed.source, yahoo), { today: TODAY });
    expect([one.conflicts, two.conflicts]).toEqual([1, 1]);
    // One inbox item for the session, not one per night.
    expect(
      opened.sqlite
        .prepare(
          "SELECT count(*) AS n, min(detail) AS d FROM inbox_item WHERE kind = 'stale_value' AND ref_id = ?",
        )
        .get(`${SIGNAL_INDEX.id}:2026-08-12`),
    ).toMatchObject({ n: 1, d: expect.stringContaining('2026-08-12') });
    expect(
      opened.sqlite
        .prepare('SELECT count(*) AS n FROM price_audit WHERE old_price_micro IS NOT NULL')
        .get(),
    ).toEqual({ n: 1 });
    expect(storedStrategyEvidence(opened.db, AS_OF)).toMatchObject({
      reason: 'close_changed_after_capture',
    });
  });

  it('replaces a close that was captured before its session ended', async () => {
    enable();
    const yahoo = fakeSource('yfinance', 'fail').source;
    await refreshPrices(opened.db, sourcesOf(fakeSource('ariva', 'ok').source, yahoo), {
      today: TODAY,
    });
    pinObservation();
    opened.sqlite
      .prepare('UPDATE price_audit SET ts = ? WHERE security_id = ? AND date = ?')
      .run('2026-11-06T15:00:00.000Z', SIGNAL_INDEX.id, '2026-11-06');
    expect(storedStrategyEvidence(opened.db, AS_OF)).toMatchObject({
      reason: 'observed_before_session_end',
    });
    const fixed = fakeSource(
      'ariva',
      'ok',
      (d) => (10_000 + ALL.indexOf(d)) * 1_000_000 + (d === '2026-11-06' ? 5 : 0),
    );
    const run = await refreshPrices(opened.db, sourcesOf(fixed.source, yahoo), { today: TODAY });
    expect(run.conflicts).toBe(0);
    pinObservation();
    expect(storedStrategyEvidence(opened.db, AS_OF).status).toBe('verified');
  });

  it('treats float-precision Yahoo values as identical to 2-decimal Ariva closes', async () => {
    enable();
    const dead = fakeSource('ariva', 'fail').source;
    await refreshPrices(opened.db, sourcesOf(fakeSource('ariva', 'ok').source, dead), {
      today: TODAY,
    });
    const floaty = fakeSource(
      'yfinance',
      'ok',
      (d) => (10_000 + ALL.indexOf(d)) * 1_000_000 + 3_456,
    );
    const audits = () => opened.sqlite.prepare('SELECT count(*) AS n FROM price_audit').get();
    const before = audits();
    const run = await refreshPrices(
      opened.db,
      sourcesOf(fakeSource('ariva', 'fail').source, floaty.source),
      {
        today: TODAY,
      },
    );
    expect(run.conflicts).toBe(0);
    expect(audits()).toEqual(before);
    pinObservation();
    expect(storedStrategyEvidence(opened.db, AS_OF).status).toBe('verified');
    // A genuine difference of one hundredth is a conflict.
    const real = fakeSource(
      'yfinance',
      'ok',
      (d) => (10_000 + ALL.indexOf(d)) * 1_000_000 + (d === '2026-11-06' ? 10_000 : 0),
    );
    const diff = await refreshPrices(
      opened.db,
      sourcesOf(fakeSource('ariva', 'fail').source, real.source),
      {
        today: TODAY,
      },
    );
    expect(diff.conflicts).toBe(1);
  });

  it('treats a differing stored close without any audit trail as a conflict, not an overwrite', async () => {
    enable();
    const dead = fakeSource('yfinance', 'fail').source;
    await refreshPrices(opened.db, sourcesOf(fakeSource('ariva', 'ok').source, dead), {
      today: TODAY,
    });
    opened.sqlite
      .prepare('DELETE FROM price_audit WHERE security_id = ? AND date = ?')
      .run(SIGNAL_INDEX.id, '2026-11-06');
    const other = fakeSource(
      'ariva',
      'ok',
      (d) => (10_000 + ALL.indexOf(d)) * 1_000_000 + (d === '2026-11-06' ? 20_000 : 0),
    );
    const run = await refreshPrices(opened.db, sourcesOf(other.source, dead), { today: TODAY });
    expect(run.conflicts).toBe(1);
    expect(
      opened.sqlite.prepare('SELECT price_micro AS p FROM price WHERE date = ?').get('2026-11-06'),
    ).toEqual({ p: (10_000 + ALL.indexOf('2026-11-06')) * 1_000_000 });
  });
});
