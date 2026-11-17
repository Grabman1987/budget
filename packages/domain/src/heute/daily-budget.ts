import { mulDivRound } from '../wealth/int';
import type { FreeUntilPayday } from '../kpi/free-until-payday';

/** Today counts; payday starts the new budget window (one day on payday itself). */
export function dailyBudget(lead: Pick<FreeUntilPayday, 'freeCents' | 'daysToPayday'>) {
  const remainingDays = Math.max(1, lead.daysToPayday);
  // The cent-rounded daily guide can leave a remainder; it never assigns or spends that remainder.
  return {
    remainingDays,
    perDayCents: lead.freeCents > 0 ? mulDivRound(lead.freeCents, 1, remainingDays) : null,
  };
}
