import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import type { HeutePeriod } from './api';
import { currentMonth, useMonth } from '../shell/use-month';
import { useStoredFlag } from '../shell/use-stored-flag';

export const PAYDAY_ONLY_THIS_MONTH = 'Bis Gehalt ist nur im aktuellen Monat verfügbar.';

/** "Bis Gehalt" only exists for the current month; any other month shows "Monat". */
export function effectivePeriod(
  month: string,
  now: string,
  chosen: HeutePeriod | undefined,
  storedMonth: boolean,
): HeutePeriod {
  if (month !== now) return 'month';
  return chosen ?? (storedMonth ? 'month' : 'payday');
}

/**
 * Explicit URL choice wins; remember it across Heute and R07, otherwise use Bis Gehalt. Outside the
 * current month the view falls back to Monat (URL included) and the stored choice is left alone.
 */
export function useBalancePeriod(): {
  period: HeutePeriod;
  setPeriod: (period: HeutePeriod) => void;
  paydayAvailable: boolean;
} {
  const { period } = useSearch({ strict: false }) as { period?: HeutePeriod };
  const [month] = useMonth();
  const [storedMonth, storeMonth] = useStoredFlag('budget-balance-month');
  const navigate = useNavigate();
  const paydayAvailable = month === currentMonth();
  const effective = effectivePeriod(month, currentMonth(), period, storedMonth);
  const setUrl = (value: HeutePeriod) =>
    void navigate({
      search: ((previous: Record<string, unknown>) => ({ ...previous, period: value })) as never,
      replace: true,
    });
  useEffect(() => {
    if (paydayAvailable) {
      if (period) storeMonth(period === 'month');
    } else if (period !== 'month') {
      setUrl('month');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, paydayAvailable, storeMonth]);
  return {
    period: effective,
    paydayAvailable,
    setPeriod: (value) => {
      if (!paydayAvailable && value === 'payday') return;
      if (paydayAvailable) storeMonth(value === 'month');
      setUrl(value);
    },
  };
}
