import {
  MISSING_STRATEGY_EVIDENCE, recordAutomaticStrategyMonthlyDecision, type Db,
} from '@budget/db';
import { strategyMonthSchedule } from '@budget/domain';
import type { StrategyEvidenceProvider } from '../api/portfolio-strategy';

/** One server-owned evaluation. No timer or provider is installed by this module. */
export async function evaluateStrategyMonthOnce(db: Db,
  provider: StrategyEvidenceProvider = async () => MISSING_STRATEGY_EVIDENCE,
  now: () => string = () => new Date().toISOString(),
) {
  const asOf = now();
  if (new Date(asOf).toISOString() !== asOf) throw new RangeError('Invalid strategy evaluation time');
  const month = asOf.slice(0, 7), today = asOf.slice(0, 10);
  const evidence = await provider(asOf);
  const resumedAt = now();
  if (new Date(resumedAt).toISOString() !== resumedAt) throw new RangeError('Invalid strategy evaluation time');
  // Never write an old provider snapshot after the UTC decision day has rolled over.
  if (resumedAt.slice(0, 10) !== today) return { status: 'evaluation_expired' as const, month };
  if (evidence.status !== 'verified') return { status: 'evidence_unavailable' as const, month };
  const calendar = evidence.months.find((entry) => entry.month === month);
  if (!calendar) return { status: 'calendar_unavailable' as const, month };
  const schedule = strategyMonthSchedule(calendar);
  if (today < schedule.signalDate || today > schedule.effectiveDate)
    return { status: 'outside_decision_window' as const, month };
  const result = recordAutomaticStrategyMonthlyDecision(db, evidence, month, asOf, { actor: 'system' });
  return { ...result, month };
}
