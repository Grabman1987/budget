import { describe, expect, it } from 'vitest';
import { strategySignalFigures, strategySignalUnavailableKind } from './strategy-signal-basis';
import { calculateStrategyTrend } from './strategy-trend';

// Synthetic index values only (1000 units per point); never market data.
describe('strategySignalFigures', () => {
  it('strong: close above the 200-session average and the average rising', () => {
    // Close 10250.000, average 10100.000, average 20 sessions earlier 10050.000.
    expect(
      strategySignalFigures({
        closeUnits: 10_250_000,
        unitsPerPoint: 1000,
        currentSumCloseUnits: 2_020_000_000n,
        pastSumCloseUnits: 2_010_000_000n,
      }),
    ).toEqual({
      trend: 'strong',
      closeCentipoints: 1_025_000,
      currentSmaCentipoints: 1_010_000,
      pastSmaCentipoints: 1_005_000,
      closeVsSma: 'above',
      smaVsPast: 'rising',
    });
  });

  it('weak: equality on both comparisons counts as not above and not rising', () => {
    expect(
      strategySignalFigures({
        closeUnits: 100_000,
        unitsPerPoint: 1000,
        currentSumCloseUnits: 20_000_000n,
        pastSumCloseUnits: 20_000_000n,
      }),
    ).toEqual({
      trend: 'weak',
      closeCentipoints: 10_000,
      currentSmaCentipoints: 10_000,
      pastSmaCentipoints: 10_000,
      closeVsSma: 'equal',
      smaVsPast: 'equal',
    });
  });

  it('weak: close below a falling average', () => {
    expect(
      strategySignalFigures({
        closeUnits: 90_000,
        unitsPerPoint: 1000,
        currentSumCloseUnits: 20_000_000n,
        pastSumCloseUnits: 21_000_000n,
      }),
    ).toMatchObject({ trend: 'weak', closeVsSma: 'below', smaVsPast: 'falling' });
  });

  it('mixed: above a falling average; the exact sums decide, not the rounded display values', () => {
    // The averages differ by 0.000005 points and both display as 100.00.
    expect(
      strategySignalFigures({
        closeUnits: 101_000,
        unitsPerPoint: 1000,
        currentSumCloseUnits: 20_000_000n,
        pastSumCloseUnits: 20_000_001n,
      }),
    ).toEqual({
      trend: 'mixed',
      closeCentipoints: 10_100,
      currentSmaCentipoints: 10_000,
      pastSmaCentipoints: 10_000,
      closeVsSma: 'above',
      smaVsPast: 'falling',
    });
  });

  it('mixed: on or below a rising average', () => {
    expect(
      strategySignalFigures({
        closeUnits: 99_999,
        unitsPerPoint: 1000,
        currentSumCloseUnits: 20_000_000n,
        pastSumCloseUnits: 19_999_999n,
      }),
    ).toMatchObject({
      trend: 'mixed',
      closeCentipoints: 10_000,
      closeVsSma: 'below',
      smaVsPast: 'rising',
    });
  });

  it('compares close x 200 with the sum at the one-unit boundary', () => {
    const at = (currentSumCloseUnits: bigint) =>
      strategySignalFigures({
        closeUnits: 100_001,
        unitsPerPoint: 1000,
        currentSumCloseUnits,
        pastSumCloseUnits: 1n,
      }).closeVsSma;
    expect(at(20_000_199n)).toBe('above');
    expect(at(20_000_200n)).toBe('equal');
    expect(at(20_000_201n)).toBe('below');
  });

  it('rounds display values half up to hundredths of a point', () => {
    const close = (closeUnits: number) =>
      strategySignalFigures({
        closeUnits,
        unitsPerPoint: 1000,
        currentSumCloseUnits: 1n,
        pastSumCloseUnits: 1n,
      }).closeCentipoints;
    expect(close(100_004)).toBe(10_000);
    expect(close(100_005)).toBe(10_001);
  });

  it('rounds the average display values half up at an exact tie', () => {
    // 20_001_000 / 200 = 100_005 units = 100.005 points -> 100.01; 20_000_999 stays 100.00.
    const sma = (currentSumCloseUnits: bigint) =>
      strategySignalFigures({
        closeUnits: 100_000,
        unitsPerPoint: 1000,
        currentSumCloseUnits,
        pastSumCloseUnits: 1n,
      }).currentSmaCentipoints;
    expect(sma(20_001_000n)).toBe(10_001);
    expect(sma(20_000_999n)).toBe(10_000);
  });

  it('matches the trend calculation for closes 1..220', () => {
    const sessions = Array.from({ length: 220 }, (_, i) => {
      const date = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
      return { date, completedAt: `${date}T21:00:00.000Z` };
    });
    const result = calculateStrategyTrend({
      asOf: '2020-08-07T22:00:00.000Z',
      latestCompletedSession: '2020-08-07',
      calendar: { id: 'synthetic-calendar', verifiedComplete: true, sessions },
      source: {
        sourceId: 'synthetic-source',
        indexId: 'synthetic-index',
        kind: 'price-index',
        currency: 'USD',
        leverage: 1,
        unitsPerPoint: 1000,
      },
      closes: sessions.map((session, i) => ({
        sessionDate: session.date,
        closedAt: session.completedAt,
        observedAt: session.completedAt,
        sourceId: 'synthetic-source',
        indexId: 'synthetic-index',
        closeUnits: i + 1,
      })),
    });
    if (result.status !== 'available') throw new Error('Expected an available trend');
    // Sums: 21..220 = 24100, 1..200 = 20100; averages 0.1205 and 0.1005 points.
    expect(
      strategySignalFigures({
        closeUnits: result.latestClose.closeUnits,
        unitsPerPoint: result.source.unitsPerPoint,
        currentSumCloseUnits: result.currentSma.sumCloseUnits,
        pastSumCloseUnits: result.pastSma.sumCloseUnits,
      }),
    ).toEqual({
      trend: 'strong',
      closeCentipoints: 22,
      currentSmaCentipoints: 12,
      pastSmaCentipoints: 10,
      closeVsSma: 'above',
      smaVsPast: 'rising',
    });
    expect(result.trend).toBe('strong');
  });

  it('rejects inputs that cannot be a signal instead of estimating', () => {
    const valid = {
      closeUnits: 100_000,
      unitsPerPoint: 1000,
      currentSumCloseUnits: 20_000_000n,
      pastSumCloseUnits: 20_000_000n,
    };
    for (const broken of [
      { closeUnits: 0 },
      { closeUnits: 1.5 },
      { unitsPerPoint: 0 },
      { currentSumCloseUnits: 0n },
      { pastSumCloseUnits: -1n },
    ])
      expect(() => strategySignalFigures({ ...valid, ...broken })).toThrow(RangeError);
  });
});

describe('strategySignalUnavailableKind', () => {
  it.each([
    ['trusted_provider_unconfigured', 'provider_missing'],
    ['signal_series_not_captured', 'not_captured'],
    ['no_completed_sessions', 'not_captured'],
    ['insufficient_history', 'insufficient_history'],
    ['trend_insufficient-history', 'insufficient_history'],
    ['session_gap', 'session_gap'],
    ['trend_missing-close', 'session_gap'],
    ['missing-close', 'session_gap'],
    ['stale', 'stale'],
    ['close_changed_after_capture', 'conflict'],
    ['untrusted_source', 'untrusted_data'],
    ['signal_instrument_identity_mismatch', 'untrusted_data'],
    ['holiday_table_out_of_range', 'calendar_out_of_range'],
    ['signal_date_pending', 'signal_date_pending'],
    ['invalid-calendar', 'invalid'],
    ['constructor', 'invalid'],
    ['something_new', 'invalid'],
  ] as const)('%s -> %s', (reason, kind) => {
    expect(strategySignalUnavailableKind(reason)).toBe(kind);
  });
});
