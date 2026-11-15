import type { StrategyTrend } from './strategy-trend';

/** Exact inputs of one trend signal, as produced by `calculateStrategyTrend` or a retained decision. */
export interface StrategySignalInputs {
  /** Close of the signal session in source units. */
  closeUnits: number;
  /** Source units per index point. */
  unitsPerPoint: number;
  /** Sum of the 200 closes ending at the signal session. */
  currentSumCloseUnits: bigint;
  /** Sum of the 200 closes ending 20 sessions earlier. */
  pastSumCloseUnits: bigint;
}

export interface StrategySignalFigures {
  trend: StrategyTrend;
  /** Display values in hundredths of an index point, rounded half up. Never compare these. */
  closeCentipoints: number;
  currentSmaCentipoints: number;
  pastSmaCentipoints: number;
  /** Exact comparisons on the unrounded sums; these decide the trend, not the display values. */
  closeVsSma: 'above' | 'equal' | 'below';
  smaVsPast: 'rising' | 'equal' | 'falling';
}

const SESSIONS = 200n;

function centipoints(numerator: bigint, denominator: bigint): number {
  const value = (numerator * 2n + denominator) / (denominator * 2n);
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('Signal figure exceeds the safe integer range');
  return Number(value);
}

/**
 * Read-only figures behind one trend signal: the close, the 200-session average and the average
 * 20 sessions earlier, plus the two exact comparisons of the owner's rule (#762). Strong: close
 * above the average and the average rising. Weak: close on or below it and the average not rising.
 * Mixed: the other two combinations. Pure; no fetch, no clock, no write.
 */
export function strategySignalFigures(input: StrategySignalInputs): StrategySignalFigures {
  const { closeUnits, unitsPerPoint, currentSumCloseUnits, pastSumCloseUnits } = input;
  if (
    !Number.isSafeInteger(closeUnits) ||
    closeUnits <= 0 ||
    !Number.isSafeInteger(unitsPerPoint) ||
    unitsPerPoint <= 0 ||
    typeof currentSumCloseUnits !== 'bigint' ||
    typeof pastSumCloseUnits !== 'bigint' ||
    currentSumCloseUnits <= 0n ||
    pastSumCloseUnits <= 0n
  )
    throw new RangeError('Invalid strategy signal inputs');
  const close = BigInt(closeUnits) * SESSIONS;
  const closeVsSma =
    close > currentSumCloseUnits ? 'above' : close === currentSumCloseUnits ? 'equal' : 'below';
  const smaVsPast =
    currentSumCloseUnits > pastSumCloseUnits
      ? 'rising'
      : currentSumCloseUnits === pastSumCloseUnits
        ? 'equal'
        : 'falling';
  const above = closeVsSma === 'above',
    rising = smaVsPast === 'rising';
  const perPoint = BigInt(unitsPerPoint);
  return {
    trend: above && rising ? 'strong' : !above && !rising ? 'weak' : 'mixed',
    closeCentipoints: centipoints(BigInt(closeUnits) * 100n, perPoint),
    currentSmaCentipoints: centipoints(currentSumCloseUnits * 100n, SESSIONS * perPoint),
    pastSmaCentipoints: centipoints(pastSumCloseUnits * 100n, SESSIONS * perPoint),
    closeVsSma,
    smaVsPast,
  };
}

/** Why a signal cannot be determined, grouped for display. The raw reason stays available. */
export type StrategySignalUnavailableKind =
  | 'provider_missing'
  | 'not_captured'
  | 'insufficient_history'
  | 'session_gap'
  | 'stale'
  | 'conflict'
  | 'untrusted_data'
  | 'calendar_out_of_range'
  | 'signal_date_pending'
  | 'invalid';

const KINDS: Record<string, StrategySignalUnavailableKind> = {
  trusted_provider_unconfigured: 'provider_missing',
  signal_series_not_captured: 'not_captured',
  no_completed_sessions: 'not_captured',
  insufficient_history: 'insufficient_history',
  'insufficient-history': 'insufficient_history',
  session_gap: 'session_gap',
  'missing-close': 'session_gap',
  stale: 'stale',
  close_changed_after_capture: 'conflict',
  signal_instrument_identity_mismatch: 'untrusted_data',
  untrusted_source: 'untrusted_data',
  currency_mismatch: 'untrusted_data',
  observation_time_missing: 'untrusted_data',
  observed_before_session_end: 'untrusted_data',
  unscheduled_session_in_evidence: 'untrusted_data',
  'invalid-source': 'untrusted_data',
  'invalid-close': 'untrusted_data',
  holiday_table_out_of_range: 'calendar_out_of_range',
  month_calendar_missing: 'calendar_out_of_range',
  signal_date_pending: 'signal_date_pending',
};

/** Maps provider and calculation reasons (with or without the `trend_` prefix) to a display kind. */
export function strategySignalUnavailableKind(reason: string): StrategySignalUnavailableKind {
  const key = reason.startsWith('trend_') ? reason.slice(6) : reason;
  return Object.hasOwn(KINDS, key) ? KINDS[key]! : 'invalid';
}
