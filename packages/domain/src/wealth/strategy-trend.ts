/** Caller-verified identity of an unlevered USD price-index series; no provider is selected here. */
export interface StrategyTrendSource {
  sourceId: string;
  indexId: string;
  kind: 'price-index';
  currency: 'USD';
  leverage: 1;
  /** Every close is a positive safe integer in this fixed number of units per index point. */
  unitsPerPoint: number;
}

export interface StrategyTrendSession {
  /** US session date, YYYY-MM-DD. */
  date: string;
  /** Actual session completion, as a canonical UTC ISO timestamp with milliseconds. */
  completedAt: string;
}

export interface StrategyTrendClose {
  sessionDate: string;
  closedAt: string;
  /** When this source observation was obtained; same canonical UTC format as completedAt. */
  observedAt: string;
  sourceId: string;
  indexId: string;
  closeUnits: number;
}

export interface StrategyTrendInput {
  /** Caller-supplied observation boundary; never reads the clock. Canonical UTC ISO timestamp. */
  asOf: string;
  latestCompletedSession: string;
  calendar: {
    id: string;
    /** Caller attests this ordered list omits no sessions from its first date through the boundary. */
    verifiedComplete: true;
    sessions: readonly StrategyTrendSession[];
  };
  source: StrategyTrendSource;
  closes: readonly StrategyTrendClose[];
}

export type StrategyTrend = 'strong' | 'weak' | 'mixed';
export type StrategyTrendUnavailableReason =
  | 'invalid-as-of'
  | 'invalid-source'
  | 'invalid-calendar'
  | 'invalid-close'
  | 'insufficient-history'
  | 'missing-close';

export interface StrategyTrendSma {
  /** Exact mean is sumCloseUnits / sessionCount / source.unitsPerPoint in index points. */
  sumCloseUnits: bigint;
  sessionCount: 200;
  fromSession: string;
  toSession: string;
}

interface StrategyTrendProvenance {
  asOf: string;
  sessionDate: string;
  calendarId: string;
  source: StrategyTrendSource;
}

export type StrategyTrendResult = StrategyTrendProvenance &
  (
    | {
        status: 'available';
        trend: StrategyTrend;
        latestClose: StrategyTrendClose;
        currentSma: StrategyTrendSma;
        pastSma: StrategyTrendSma;
      }
    | {
        status: 'unavailable';
        reason: StrategyTrendUnavailableReason;
        missingSessions: string[];
      }
  );

function timestamp(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return NaN;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value ? ms : NaN;
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(timestamp(`${value}T00:00:00.000Z`));
}

function nonempty(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Pure daily preview only: no monthly decision, target selection, fetch, inferred calendar or write.
 * Trusts the caller's verified calendar/source identity, then checks internal consistency. Exactly
 * 220 consecutive supplied completed sessions are needed: current [20..219], past [0..199].
 * Missing closes never shift either window. BigInt sums preserve strict comparisons; an eventual
 * API adapter must explicitly serialize these exact values rather than JSON.stringify the result.
 */
export function calculateStrategyTrend(input: StrategyTrendInput): StrategyTrendResult {
  const { calendar, source, closes, asOf, latestCompletedSession } = input;
  const provenance: StrategyTrendProvenance = {
    asOf,
    sessionDate: latestCompletedSession,
    calendarId: calendar.id,
    source: { ...source },
  };
  const unavailable = (
    reason: StrategyTrendUnavailableReason,
    missingSessions: string[] = [],
  ): StrategyTrendResult => ({ ...provenance, status: 'unavailable', reason, missingSessions });
  const asOfMs = timestamp(asOf);
  if (!Number.isFinite(asOfMs)) return unavailable('invalid-as-of');
  if (
    !nonempty(source.sourceId) ||
    !nonempty(source.indexId) ||
    source.kind !== 'price-index' ||
    source.currency !== 'USD' ||
    source.leverage !== 1 ||
    !Number.isSafeInteger(source.unitsPerPoint) ||
    source.unitsPerPoint <= 0
  )
    return unavailable('invalid-source');

  if (
    !nonempty(calendar.id) ||
    calendar.verifiedComplete !== true ||
    !validDate(latestCompletedSession)
  )
    return unavailable('invalid-calendar');
  const sessions = new Map<string, StrategyTrendSession>();
  let previousDate = '';
  for (const session of calendar.sessions) {
    const completedMs = timestamp(session.completedAt);
    if (
      !validDate(session.date) ||
      session.date <= previousDate ||
      !Number.isFinite(completedMs) ||
      completedMs > asOfMs ||
      session.completedAt.slice(0, 10) !== session.date
    )
      return unavailable('invalid-calendar');
    sessions.set(session.date, session);
    previousDate = session.date;
  }
  if (calendar.sessions.length > 0 && previousDate !== latestCompletedSession)
    return unavailable('invalid-calendar');

  const quotes = new Map<string, StrategyTrendClose>();
  for (const close of closes) {
    const session = sessions.get(close.sessionDate);
    const closedMs = timestamp(close.closedAt);
    const observedMs = timestamp(close.observedAt);
    if (
      !session ||
      quotes.has(close.sessionDate) ||
      close.sourceId !== source.sourceId ||
      close.indexId !== source.indexId ||
      !Number.isSafeInteger(close.closeUnits) ||
      close.closeUnits <= 0 ||
      close.closedAt !== session.completedAt ||
      !Number.isFinite(closedMs) ||
      !Number.isFinite(observedMs) ||
      observedMs < closedMs ||
      observedMs > asOfMs
    )
      return unavailable('invalid-close');
    quotes.set(close.sessionDate, close);
  }
  if (calendar.sessions.length < 220) return unavailable('insufficient-history');
  const window = calendar.sessions.slice(-220);
  const missing = window.filter((s) => !quotes.has(s.date)).map((s) => s.date);
  if (missing.length > 0) return unavailable('missing-close', missing);

  const sma = (start: number): StrategyTrendSma => ({
    sumCloseUnits: window
      .slice(start, start + 200)
      .reduce((sum, session) => sum + BigInt(quotes.get(session.date)!.closeUnits), 0n),
    sessionCount: 200,
    fromSession: window[start]!.date,
    toSession: window[start + 199]!.date,
  });
  const currentSma = sma(20);
  const pastSma = sma(0);
  const latestClose = { ...quotes.get(latestCompletedSession)! };
  const above = BigInt(latestClose.closeUnits) * 200n > currentSma.sumCloseUnits;
  const rising = currentSma.sumCloseUnits > pastSma.sumCloseUnits;
  const trend: StrategyTrend = above && rising ? 'strong' : !above && !rising ? 'weak' : 'mixed';
  return { ...provenance, status: 'available', trend, latestClose, currentSma, pastSma };
}
