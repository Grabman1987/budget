import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import type { HeutePeriod } from './api';
import { useStoredFlag } from '../shell/use-stored-flag';

/** Explicit URL choice wins; remember it across Heute and R07, otherwise use Bis Gehalt. */
export function useBalancePeriod(): [HeutePeriod, (period: HeutePeriod) => void] {
  const { period } = useSearch({ strict: false }) as { period?: HeutePeriod };
  const [month, storeMonth] = useStoredFlag('budget-balance-month');
  const navigate = useNavigate();
  useEffect(() => {
    if (period) storeMonth(period === 'month');
  }, [period, storeMonth]);
  return [
    period ?? (month ? 'month' : 'payday'),
    (value) => {
      storeMonth(value === 'month');
      void navigate({
        search: ((previous: Record<string, unknown>) => ({ ...previous, period: value })) as never,
        replace: true,
      });
    },
  ];
}
