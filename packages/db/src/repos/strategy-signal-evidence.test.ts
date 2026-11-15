import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { price, priceAudit, security } from '../schema';
import { listSecurities } from './securities';
import { SIGNAL_INDEX, storedStrategyEvidence } from './strategy-signal-evidence';
import {
  scheduledSessionsThrough,
  seedSignalCloses,
  seedSignalInstrument,
} from './strategy-signal-fixture';

let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
});
afterEach(() => opened.close());

const LAST = '2026-11-09';
const AS_OF = '2026-11-10T12:00:00.000Z';
const sessions = () => scheduledSessionsThrough('2025-11', LAST);
const evidence = (asOf = AS_OF) => storedStrategyEvidence(opened.db, asOf);
const reason = (asOf = AS_OF) => {
  const e = evidence(asOf);
  return e.status === 'unavailable' ? e.reason : 'verified';
};
const seed = (list = sessions(), options?: Parameters<typeof seedSignalCloses>[2]) => {
  seedSignalInstrument(opened.db);
  seedSignalCloses(opened.db, list, options);
};

describe('stored signal evidence', () => {
  it('is verified from stored sessions, with source, observation time and month calendars', () => {
    seed();
    const e = evidence();
    expect(e.status).toBe('verified');
    if (e.status !== 'verified') return;
    expect(e.input.latestCompletedSession).toBe(LAST);
    expect(e.input.source).toMatchObject({ currency: 'USD', kind: 'price-index', leverage: 1 });
    expect(e.input.source.sourceId).toBe('ariva:72');
    const dates = e.input.calendar.sessions.map((s) => s.date);
    expect(dates.length).toBeGreaterThanOrEqual(220);
    expect(dates).toEqual(expect.arrayContaining(['2026-11-05', LAST]));
    expect(dates).not.toContain('2026-11-07');
    expect(e.input.closes.at(-1)?.observedAt).toBe('2026-11-10T02:00:00.000Z');
    // The running month names its not yet observed sessions from the published table.
    expect(e.months.map((m) => m.month)).toEqual(['2026-11', '2026-12']);
    expect(e.months[0]?.sessions.slice(-2)).toEqual(['2026-11-27', '2026-11-30']);
  });

  it('names every source that delivered the window when ariva and yfinance mix', () => {
    seed(sessions(), (date) => ({ source: date === LAST ? 'yfinance' : 'ariva' }));
    const e = evidence();
    expect(e.status === 'verified' && e.input.source.sourceId).toBe('ariva:72+yfinance:^NDX');
  });

  it('is unavailable without a captured series', () => {
    expect(reason()).toBe('signal_series_not_captured');
  });

  it('is unavailable when the instrument exists but nothing was stored', () => {
    seed([]);
    expect(reason()).toBe('no_completed_sessions');
  });

  it('refuses fewer than 220 sessions', () => {
    seed(scheduledSessionsThrough('2026-06', LAST));
    expect(reason()).toBe('insufficient_history');
  });

  it('refuses a gap that no holiday explains and reports it', () => {
    seed(sessions().filter((d) => d !== '2026-08-12'));
    expect(evidence()).toMatchObject({
      status: 'unavailable',
      reason: 'session_gap',
      missingSessions: ['2026-08-12'],
    });
  });

  it('refuses a stored session the published schedule does not know', () => {
    seed([...sessions(), '2026-11-07'].sort());
    expect(reason()).toBe('unscheduled_session_in_evidence');
  });

  it('treats holidays as non-sessions without reporting a gap', () => {
    seed();
    const e = evidence();
    const dates = e.status === 'verified' ? e.input.calendar.sessions.map((s) => s.date) : [];
    expect(dates.length).toBeGreaterThan(0);
    expect(dates).not.toContain('2026-04-03');
    expect(dates).not.toContain('2026-11-26');
  });

  it('is stale when a completed session is missing for more than 30 hours', () => {
    seed();
    expect(reason('2026-11-10T12:00:00.000Z')).toBe('verified');
    // 10.11. closes 21:00Z; at 12.11. 04:00Z it is 31 h old and still not stored.
    expect(evidence('2026-11-12T04:00:00.000Z')).toMatchObject({
      status: 'unavailable',
      reason: 'stale',
      missingSessions: ['2026-11-10'],
    });
  });

  it('ignores rows that were completed or first observed after the as-of time', () => {
    seed();
    const e = evidence('2026-11-09T12:00:00.000Z');
    expect(e.status === 'verified' && e.input.latestCompletedSession).toBe('2026-11-06');
  });

  it('rejects manual closes and a foreign close currency', () => {
    seed(sessions(), (date) => (date === '2026-03-02' ? { source: 'manual' } : {}));
    expect(reason()).toBe('untrusted_source');
    opened.db.delete(priceAudit).run();
    opened.db.delete(price).run();
    seedSignalCloses(opened.db, sessions(), (d) => (d === LAST ? { currency: 'EUR' } : {}));
    expect(reason()).toBe('currency_mismatch');
  });

  it('rejects closes without an observation time', () => {
    seed(sessions(), (date) => (date === '2026-03-02' ? { withAudit: false } : {}));
    expect(reason()).toBe('observation_time_missing');
  });

  it('rejects a close that was captured before its session ended', () => {
    seed(sessions(), (date) => (date === LAST ? { observedAfterHours: -2 } : {}));
    expect(reason()).toBe('observed_before_session_end');
  });

  it.each([
    ['currency', { currency: 'EUR' }],
    ['symbol', { symbol: 'NQ=F' }],
    ['exchange', { quoteExchange: '216' }],
    ['leverage', { leverageFactor: 20 }],
    ['kind', { kind: 'etf' as const }],
    ['quote page', { quoteUrl: 'https://www.ariva.de/etf/other/kurse/historische-kurse' }],
    ['allocation membership', { allocationIncluded: true }],
  ])('rejects a changed instrument identity (%s)', (_name, over) => {
    seed();
    opened.db.update(security).set(over).where(eq(security.id, SIGNAL_INDEX.id)).run();
    expect(reason()).toBe('signal_instrument_identity_mismatch');
  });

  it('is unavailable instead of guessing when the holiday table ends', () => {
    seed(scheduledSessionsThrough('2028-01', '2028-12-29'));
    expect(reason('2029-01-03T12:00:00.000Z')).toBe('holiday_table_out_of_range');
  });

  it('is not stale on a Monday or after a holiday while the last completed session is stored', () => {
    seed(scheduledSessionsThrough('2025-11', '2026-11-06'));
    // Monday 09.11. noon: Friday 06.11. is the newest completed session.
    expect(reason('2026-11-09T12:00:00.000Z')).toBe('verified');
    opened.db.delete(priceAudit).run();
    opened.db.delete(price).run();
    seedSignalCloses(opened.db, scheduledSessionsThrough('2025-11', '2026-11-25'));
    // Friday 27.11. noon, Thanksgiving (26.11.) in between: Wednesday 25.11. is the newest.
    expect(reason('2026-11-27T12:00:00.000Z')).toBe('verified');
  });

  it('dates session ends correctly across the US daylight-saving change', () => {
    seed();
    const e = evidence();
    const closed = (day: string) =>
      e.status === 'verified' ? e.input.closes.find((c) => c.sessionDate === day)?.closedAt : null;
    expect(closed('2026-03-06')).toBe('2026-03-06T21:00:00.000Z');
    expect(closed('2026-03-09')).toBe('2026-03-09T20:00:00.000Z');
  });

  it('checks source, currency and observation only inside the evidence window', () => {
    // An old manual row far outside the last 260 sessions cannot poison the evidence.
    seed(['2023-01-03', '2023-01-04'].concat(sessions()), (date) =>
      date.startsWith('2023') ? { source: 'manual', withAudit: false } : {},
    );
    expect(reason()).toBe('verified');
  });

  it('is unavailable when a stored close of the window was changed afterwards', () => {
    seed();
    opened.db
      .insert(priceAudit)
      .values({
        id: 'change',
        securityId: SIGNAL_INDEX.id,
        date: '2026-08-12',
        oldPriceMicro: 1,
        newPriceMicro: 2,
        oldSource: 'ariva',
        newSource: 'yfinance',
      })
      .run();
    expect(reason()).toBe('close_changed_after_capture');
  });

  it('hides the signal series from the user-facing security list', () => {
    seed();
    expect(listSecurities(opened.db).map((s) => s.id)).not.toContain(SIGNAL_INDEX.id);
  });

  it('is unavailable when the next month is outside the holiday table', () => {
    seed(scheduledSessionsThrough('2027-12', '2028-12-29'));
    expect(reason('2028-12-30T12:00:00.000Z')).toBe('holiday_table_out_of_range');
  });
});
