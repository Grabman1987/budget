import {
  strategySignalFigures,
  strategySignalUnavailableKind,
  type StrategySignalFigures,
  type StrategySignalUnavailableKind,
  type StrategyTrendResult,
} from '@budget/domain';
import type { StrategyDecision, StrategyEvidence } from './portfolio-strategy';

/**
 * Read-only basis of one trend signal (#762): the dated result with its inputs, or the reason why
 * it cannot be determined. Never an estimate and never a write.
 */
export type StrategySignalBasisEntry =
  | ({
      status: 'available';
      /** US session whose close decides the signal. */
      sessionDate: string;
      /** Last US session of the month, from which a monthly signal applies; null for the preview. */
      effectiveDate: string | null;
      /** When the deciding close was first stored. */
      observedAt: string;
      /** When a binding decision was stored; null for signals that are not stored. */
      knownAt: string | null;
      sourceId: string;
      indexId: string;
      calendarId: string;
    } & StrategySignalFigures)
  | {
      status: 'unavailable';
      kind: StrategySignalUnavailableKind;
      reason: string;
      missingSessions: string[];
      /** The pending signal session, when the reason is that it has not completed yet. */
      signalDate: string | null;
    };

const unavailable = (
  reason: string,
  missingSessions: readonly string[] = [],
  signalDate: string | null = null,
): StrategySignalBasisEntry => ({
  status: 'unavailable',
  kind: strategySignalUnavailableKind(reason),
  reason,
  missingSessions: [...missingSessions],
  signalDate,
});

function fromTrend(result: StrategyTrendResult, effectiveDate: string | null) {
  if (result.status === 'unavailable') return unavailable(result.reason, result.missingSessions);
  const figures = strategySignalFigures({
    closeUnits: result.latestClose.closeUnits,
    unitsPerPoint: result.source.unitsPerPoint,
    currentSumCloseUnits: result.currentSma.sumCloseUnits,
    pastSumCloseUnits: result.pastSma.sumCloseUnits,
  });
  if (figures.trend !== result.trend)
    throw new RangeError('Strategy signal figures disagree with the calculated trend');
  return {
    status: 'available',
    sessionDate: result.sessionDate,
    effectiveDate,
    observedAt: result.latestClose.observedAt,
    knownAt: null,
    sourceId: result.source.sourceId,
    indexId: result.source.indexId,
    calendarId: result.calendarId,
    ...figures,
  } satisfies StrategySignalBasisEntry;
}

function fromDecision(decision: StrategyDecision): StrategySignalBasisEntry {
  const figures = strategySignalFigures({
    closeUnits: decision.latestCloseUnits,
    unitsPerPoint: decision.unitsPerPoint,
    currentSumCloseUnits: BigInt(decision.currentSum),
    pastSumCloseUnits: BigInt(decision.pastSum),
  });
  if (figures.trend !== decision.trend)
    throw new RangeError('Retained strategy decision disagrees with its stored inputs');
  const signalClose = decision.closes.find((close) => close.sessionDate === decision.signalDate);
  if (!signalClose) throw new RangeError('Retained strategy decision lacks its signal close');
  return {
    status: 'available',
    sessionDate: decision.signalDate,
    effectiveDate: decision.effectiveDate,
    observedAt: signalClose.observedAt,
    knownAt: decision.knownAt,
    sourceId: decision.sourceId,
    indexId: decision.indexId,
    calendarId: decision.calendarId,
    ...figures,
  };
}

/**
 * The three signals the strategy view names: the daily preview (latest completed US session), the
 * running month's signal (penultimate US session) and the retained binding decision. A missing or
 * stale series makes the first two unavailable with the provider's reason; the binding decision
 * keeps its own stored inputs.
 */
export function strategySignalBasis(input: {
  evidence: StrategyEvidence;
  daily: StrategyTrendResult | null;
  monthly: { signalDate: string; effectiveDate: string; signal: StrategyTrendResult } | null;
  binding: StrategyDecision | null;
}): {
  daily: StrategySignalBasisEntry;
  monthly: StrategySignalBasisEntry;
  binding: StrategySignalBasisEntry | null;
} {
  const { evidence, daily, monthly, binding } = input;
  const missing =
    evidence.status === 'unavailable'
      ? unavailable(evidence.reason, evidence.missingSessions)
      : null;
  return {
    daily: missing ?? (daily ? fromTrend(daily, null) : unavailable('invalid')),
    monthly:
      missing ??
      (!monthly
        ? unavailable('month_calendar_missing')
        : evidence.status === 'verified' &&
            evidence.input.latestCompletedSession < monthly.signalDate
          ? unavailable('signal_date_pending', [], monthly.signalDate)
          : fromTrend(monthly.signal, monthly.effectiveDate)),
    binding: binding ? fromDecision(binding) : null,
  };
}
