import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import {
  portfolioStrategyView,
  recordStrategyMonthlyDecision,
  saveStrategyConfiguration,
  strategyConfiguration,
} from './portfolio-strategy';
import { seedStrategyTestPortfolio, strategyTestConfiguration } from './portfolio-strategy-fixture';
import { storedStrategyEvidence } from './strategy-signal-evidence';
import {
  scheduledSessionsThrough,
  seedSignalCloses,
  seedSignalInstrument,
} from './strategy-signal-fixture';

// Synthetic series: session i (from 0, starting 03.11.2025) closes at 10000 + i points.
// 09.11.2026 is session 255, 27.11.2026 session 268 (269 scheduled sessions in total).
let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedStrategyTestPortfolio(opened);
});
afterEach(() => opened.close());

const seed = (last: string, skip: string[] = []) => {
  seedSignalInstrument(opened.db);
  seedSignalCloses(
    opened.db,
    scheduledSessionsThrough('2025-11', last).filter((day) => !skip.includes(day)),
  );
};
const basis = (asOf: string) =>
  portfolioStrategyView(opened.db, asOf, storedStrategyEvidence(opened.db, asOf)).signalBasis;
const unavailable = (kind: string, reason: string, missingSessions: string[] = []) => ({
  status: 'unavailable',
  kind,
  reason,
  missingSessions,
  signalDate: null,
});

it('shows the daily preview with its inputs and keeps the monthly signal open before its session', () => {
  seed('2026-11-09');
  const result = basis('2026-11-10T12:00:00.000Z');
  // Close 10255.00; mean of sessions 56..255 = 10155.50; mean of sessions 36..235 = 10135.50.
  expect(result.daily).toEqual({
    status: 'available',
    sessionDate: '2026-11-09',
    effectiveDate: null,
    observedAt: '2026-11-10T02:00:00.000Z',
    knownAt: null,
    sourceId: 'ariva:72',
    indexId: 'nasdaq-100-usd-price-index:NDX',
    calendarId: expect.any(String),
    trend: 'strong',
    closeCentipoints: 1_025_500,
    currentSmaCentipoints: 1_015_550,
    pastSmaCentipoints: 1_013_550,
    closeVsSma: 'above',
    smaVsPast: 'rising',
  });
  expect(result.monthly).toEqual({
    status: 'unavailable',
    kind: 'signal_date_pending',
    reason: 'signal_date_pending',
    missingSessions: [],
    signalDate: '2026-11-27',
  });
  expect(result.binding).toBeNull();
});

it('does not estimate a signal while no series is captured', () => {
  const result = basis('2026-11-10T12:00:00.000Z');
  expect(result.daily).toEqual(unavailable('not_captured', 'signal_series_not_captured'));
  expect(result.monthly).toEqual(unavailable('not_captured', 'signal_series_not_captured'));
  expect(result.binding).toBeNull();
});

it('names the missing session of a gap instead of shifting the window', () => {
  seed('2026-11-09', ['2026-09-16']);
  const result = basis('2026-11-10T12:00:00.000Z');
  expect(result.daily).toEqual(unavailable('session_gap', 'session_gap', ['2026-09-16']));
  expect(result.monthly).toEqual(result.daily);
});

it('keeps the retained binding decision with its own inputs while the series is stale', () => {
  seed('2026-11-27');
  const recordedAt = '2026-11-28T10:00:00.000Z';
  saveStrategyConfiguration(
    opened.db,
    { config: strategyTestConfiguration(), revision: strategyConfiguration(opened.db).revision },
    '2026-11-28',
    { actor: 'test', groupId: 'config' },
  );
  // Close 10268.00; mean of sessions 69..268 = 10168.50; mean of sessions 49..248 = 10148.50.
  const figures = {
    status: 'available',
    sessionDate: '2026-11-27',
    effectiveDate: '2026-11-30',
    observedAt: '2026-11-28T02:00:00.000Z',
    sourceId: 'ariva:72',
    indexId: 'nasdaq-100-usd-price-index:NDX',
    calendarId: expect.any(String),
    trend: 'strong',
    closeCentipoints: 1_026_800,
    currentSmaCentipoints: 1_016_850,
    pastSmaCentipoints: 1_014_850,
    closeVsSma: 'above',
    smaVsPast: 'rising',
  };
  expect(basis(recordedAt).monthly).toEqual({ ...figures, knownAt: null });
  const evidence = storedStrategyEvidence(opened.db, recordedAt);
  if (evidence.status !== 'verified') throw new Error('Expected verified evidence');
  recordStrategyMonthlyDecision(
    opened.db,
    evidence,
    '2026-11',
    recordedAt,
    strategyConfiguration(opened.db).revision,
    { actor: 'test', groupId: 'decision' },
  );
  const settings = () => opened.sqlite.prepare('SELECT * FROM app_setting ORDER BY id').all();
  const before = settings();

  // 30.11. and 01.12. completed more than 30 hours ago and were never stored.
  const stale = basis('2026-12-03T12:00:00.000Z');
  expect(stale.daily).toEqual(unavailable('stale', 'stale', ['2026-11-30', '2026-12-01']));
  expect(stale.monthly).toEqual(stale.daily);
  expect(stale.binding).toEqual({ ...figures, knownAt: recordedAt });
  // Reading the basis writes nothing.
  expect(settings()).toEqual(before);
});
