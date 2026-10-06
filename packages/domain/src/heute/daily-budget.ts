import type { FreeUntilPayday } from '../kpi/free-until-payday';

/** Today counts; payday starts the new budget window (one day on payday itself). */
export function dailyBudget(lead: Pick<FreeUntilPayday, 'freeCents' | 'daysToPayday'>) {
  const remainingDays = Math.max(1, lead.daysToPayday);
  return {
    remainingDays,
    perDayCents: lead.freeCents > 0 ? Math.round(lead.freeCents / remainingDays) : null,
  };
}
