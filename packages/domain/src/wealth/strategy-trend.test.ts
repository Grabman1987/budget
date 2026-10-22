import { describe, expect, it } from 'vitest';
import { calculateStrategyTrend, type StrategyTrendInput } from './strategy-trend';

// Synthetic supplied sessions with gaps. These are not a real exchange calendar.
function input(values = Array.from({ length: 220 }, (_, i) => i + 1)): StrategyTrendInput {
  const sessions = values.map((_, i) => {
    const date = new Date(Date.UTC(2020, 0, 1 + i * 2)).toISOString().slice(0, 10);
    return { date, completedAt: `${date}T21:00:00.000Z` };
  });
  const latestCompletedSession = sessions.at(-1)?.date ?? '2020-01-01';
  return {
    asOf: `${latestCompletedSession}T22:00:00.000Z`,
    latestCompletedSession,
    calendar: { id: 'synthetic-calendar-v1', verifiedComplete: true, sessions },
    source: {
      sourceId: 'synthetic-source',
      indexId: 'synthetic-index',
      kind: 'price-index',
      currency: 'USD',
      leverage: 1,
      unitsPerPoint: 1000,
    },
    closes: values.map((closeUnits, i) => ({
      sessionDate: sessions[i]!.date,
      closedAt: sessions[i]!.completedAt,
      observedAt: `${sessions[i]!.date}T21:05:00.000Z`,
      sourceId: 'synthetic-source',
      indexId: 'synthetic-index',
      closeUnits,
    })),
  };
}

function trend(values: number[]) {
  const result = calculateStrategyTrend(input(values));
  expect(result.status).toBe('available');
  if (result.status !== 'available') throw new Error('Expected available trend');
  return result;
}

describe('strategy daily trend preview', () => {
  it('uses 200 closes now and 200 closes ending exactly 20 supplied sessions earlier', () => {
    const data = input();
    const result = calculateStrategyTrend(data);
    expect(result).toEqual({
      status: 'available',
      trend: 'strong',
      asOf: data.asOf,
      sessionDate: data.latestCompletedSession,
      calendarId: data.calendar.id,
      source: data.source,
      latestClose: data.closes[219],
      currentSma: {
        sumCloseUnits: 24100n,
        sessionCount: 200,
        fromSession: data.calendar.sessions[20]!.date,
        toSession: data.calendar.sessions[219]!.date,
      },
      pastSma: {
        sumCloseUnits: 20100n,
        sessionCount: 200,
        fromSession: data.calendar.sessions[0]!.date,
        toSession: data.calendar.sessions[199]!.date,
      },
    });
  });

  it('treats both equalities as weak, and a falling below-average close as weak', () => {
    expect(trend(Array(220).fill(100)).trend).toBe('weak');
    expect(trend(Array.from({ length: 220 }, (_, i) => 220 - i)).trend).toBe('weak');
  });

  it('treats above-average with flat SMA and below-average with rising SMA as mixed', () => {
    const flat = Array<number>(220).fill(100);
    flat[218] = 99;
    flat[219] = 101;
    expect(trend(flat).trend).toBe('mixed');
    const rising = [...Array<number>(20).fill(1), ...Array<number>(200).fill(100)];
    rising[218] = 200;
    expect(trend(rising).trend).toBe('mixed');
  });

  it('does not count an equal close as above the SMA even when the SMA rises', () => {
    expect(trend([...Array<number>(20).fill(1), ...Array<number>(200).fill(100)]).trend).toBe(
      'mixed',
    );
  });

  it('compares exact sums even when Number precision would erase a one-unit rise', () => {
    const values = Array<number>(220).fill(Number.MAX_SAFE_INTEGER - 1);
    values[219] = Number.MAX_SAFE_INTEGER;
    const result = trend(values);
    expect(result.trend).toBe('strong');
    expect(result.currentSma.sumCloseUnits).toBe(1801439850948198001n);
    expect(result.pastSma.sumCloseUnits).toBe(1801439850948198000n);
  });

  it('keeps an exactly equal close mixed when only the past SMA is one unit lower', () => {
    const values = Array<number>(220).fill(Number.MAX_SAFE_INTEGER - 1);
    values[0] = Number.MAX_SAFE_INTEGER - 2;
    const result = trend(values);
    expect(result.trend).toBe('mixed');
    expect(result.currentSma.sumCloseUnits).toBe(1801439850948198000n);
    expect(result.pastSma.sumCloseUnits).toBe(1801439850948197999n);
  });

  it('uses the latest 220 sessions when more history is supplied and accepts unordered quotes', () => {
    const data = input(Array.from({ length: 240 }, (_, i) => i + 1));
    data.closes = [...data.closes].reverse();
    const result = calculateStrategyTrend(data);
    expect(result.status).toBe('available');
    if (result.status !== 'available') throw new Error('Expected available trend');
    expect(result.currentSma.sumCloseUnits).toBe(28100n);
    expect(result.pastSma.sumCloseUnits).toBe(24100n);
    expect(result.pastSma.fromSession).toBe(data.calendar.sessions[20]!.date);
  });

  it('returns explicit unavailable for 219 or no sessions', () => {
    for (const values of [Array<number>(219).fill(100), []]) {
      expect(calculateStrategyTrend(input(values))).toMatchObject({
        status: 'unavailable',
        reason: 'insufficient-history',
      });
    }
  });

  it.each([0, 20, 199, 219])('does not bridge a missing close at session %i', (missing) => {
    const data = input();
    data.closes = data.closes.filter((_, i) => i !== missing);
    expect(calculateStrategyTrend(data)).toMatchObject({
      status: 'unavailable',
      reason: 'missing-close',
      sessionDate: data.latestCompletedSession,
      missingSessions: [data.calendar.sessions[missing]!.date],
    });
  });

  it('retains as-of and source metadata without mutating the supplied data', () => {
    const data = input();
    const before = JSON.stringify(data);
    const result = calculateStrategyTrend(data);
    expect(result).toMatchObject({ asOf: data.asOf, source: data.source });
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe('strategy trend input guards', () => {
  it.each([
    ['currency', 'EUR'],
    ['kind', 'total-return-index'],
    ['leverage', 2],
    ['sourceId', ''],
    ['indexId', ' '],
    ['unitsPerPoint', 0],
    ['unitsPerPoint', 1.5],
    ['unitsPerPoint', Number.MAX_SAFE_INTEGER + 1],
  ])('rejects invalid source %s=%s', (key, value) => {
    const data = input();
    Object.assign(data.source, { [key]: value });
    expect(calculateStrategyTrend(data)).toMatchObject({
      status: 'unavailable',
      reason: 'invalid-source',
    });
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid close %s',
    (closeUnits) => {
      const data = input();
      data.closes = data.closes.map((q, i) => (i === 0 ? { ...q, closeUnits } : q));
      expect(calculateStrategyTrend(data)).toMatchObject({
        status: 'unavailable',
        reason: 'invalid-close',
      });
    },
  );

  it.each(['sourceId', 'indexId'])('rejects quote %s mismatch', (key) => {
    const data = input();
    data.closes = data.closes.map((q, i) => (i === 0 ? { ...q, [key]: 'other' } : q));
    expect(calculateStrategyTrend(data)).toMatchObject({
      status: 'unavailable',
      reason: 'invalid-close',
    });
  });

  it('rejects duplicate closes rather than selecting one', () => {
    const data = input();
    data.closes = [...data.closes, data.closes[0]!];
    expect(calculateStrategyTrend(data)).toMatchObject({
      status: 'unavailable',
      reason: 'invalid-close',
    });
  });

  it('rejects quotes on a date outside the supplied session list', () => {
    const data = input();
    data.closes = [...data.closes, { ...data.closes[0]!, sessionDate: '2020-01-02' }];
    expect(calculateStrategyTrend(data)).toMatchObject({
      status: 'unavailable',
      reason: 'invalid-close',
    });
  });

  it.each([
    ['closedAt', '2020-01-02T21:00:00.000Z'],
    ['closedAt', '2020-01-01T20:59:00.000Z'],
    ['observedAt', '2020-01-01T20:59:00.000Z'],
    ['observedAt', '2030-01-01T21:05:00.000Z'],
    ['observedAt', '2020-02-30T21:05:00.000Z'],
  ])('rejects a cross-date, open, future or malformed quote timestamp %s=%s', (key, value) => {
    const data = input();
    data.closes = data.closes.map((q, i) => (i === 0 ? { ...q, [key]: value } : q));
    expect(calculateStrategyTrend(data)).toMatchObject({
      status: 'unavailable',
      reason: 'invalid-close',
    });
  });

  it.each(['2020-02-30', '2020-13-01', '2020-1-01', ''])('rejects malformed session %s', (date) => {
    const data = input();
    data.calendar.sessions = data.calendar.sessions.map((s, i) => (i === 0 ? { ...s, date } : s));
    expect(calculateStrategyTrend(data)).toMatchObject({
      status: 'unavailable',
      reason: 'invalid-calendar',
    });
  });

  it('rejects duplicate and unordered calendar sessions', () => {
    for (const order of ['duplicate', 'reversed']) {
      const data = input();
      data.calendar.sessions =
        order === 'duplicate'
          ? [data.calendar.sessions[0]!, ...data.calendar.sessions]
          : [...data.calendar.sessions].reverse();
      expect(calculateStrategyTrend(data)).toMatchObject({
        status: 'unavailable',
        reason: 'invalid-calendar',
      });
    }
  });

  it('requires verified calendar completeness and explicit identity', () => {
    for (const change of [{ verifiedComplete: false }, { id: '' }]) {
      const data = input();
      Object.assign(data.calendar, change);
      expect(calculateStrategyTrend(data)).toMatchObject({
        status: 'unavailable',
        reason: 'invalid-calendar',
      });
    }
  });

  it('rejects future or still-open calendar sessions relative to the supplied as-of', () => {
    const data = input();
    data.asOf = `${data.latestCompletedSession}T20:00:00.000Z`;
    expect(calculateStrategyTrend(data)).toMatchObject({
      status: 'unavailable',
      reason: 'invalid-calendar',
    });
  });

  it('rejects session completion timestamps that disagree with their session date or order', () => {
    const data = input();
    data.calendar.sessions = data.calendar.sessions.map((s, i) =>
      i === 0 ? { ...s, completedAt: '2020-01-03T21:00:00.000Z' } : s,
    );
    expect(calculateStrategyTrend(data)).toMatchObject({
      status: 'unavailable',
      reason: 'invalid-calendar',
    });
  });

  it('requires the calendar to end at the explicitly supplied latest completed session', () => {
    const data = input();
    data.latestCompletedSession = data.calendar.sessions[218]!.date;
    expect(calculateStrategyTrend(data)).toMatchObject({
      status: 'unavailable',
      reason: 'invalid-calendar',
    });
  });

  it.each(['2020-02-30T22:00:00.000Z', '2020-01-01', 'invalid'])(
    'rejects invalid as-of %s',
    (asOf) => {
      const data = input();
      data.asOf = asOf;
      expect(calculateStrategyTrend(data)).toMatchObject({
        status: 'unavailable',
        reason: 'invalid-as-of',
      });
    },
  );
});
