import {
  createTestDatabase,
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

const enable = () =>
  saveStrategyConfiguration(
    opened.db,
    { config: strategyTestConfiguration(), revision: strategyConfiguration(opened.db).revision },
    '2026-09-30',
    { actor: 'test', groupId: 'config' },
  );

/** A source that only knows the signal series; synthetic closes, nothing from the network. */
function fakeSource(id: 'ariva' | 'yfinance', mode: 'ok' | 'fail' | 'empty') {
  const calls: Array<{ from: string; to: string }> = [];
  const source: QuoteSource = {
    id,
    supports: (ref) => ref.id === SIGNAL_INDEX.id,
    async history(_ref, from, to) {
      calls.push({ from, to });
      if (mode === 'fail') throw new MarketError('timeout');
      if (mode === 'empty') return [];
      return ALL.filter((d) => d >= from && d <= to).map((date, i) => ({
        date,
        priceMicro: (10_000 + i) * 1_000_000,
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
    // A second run asks only for what is new.
    await refreshMarket(opened.db, sourcesOf(ariva.source, yahoo.source), '2026-11-10');
    expect(ariva.calls[1]).toEqual({ from: '2026-11-10', to: '2026-11-10' });
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
});
