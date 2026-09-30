import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo } from 'react';
import { monthOf, shiftMonth } from '../nav/month';

/**
 * Selected month (`?monat=YYYY-MM`, default: the current month) and a function that moves it by a
 * number of months. Changing the month replaces the history entry: it is a view setting, not a
 * page visit.
 */
export function useMonth(): [month: string, shift: (delta: number) => void] {
  const { monat } = useSearch({ strict: false }) as { monat?: string };
  const navigate = useNavigate();
  const current = useMemo(() => monthOf(new Date()), []);
  const month = monat ?? current;
  const shift = (delta: number) =>
    void navigate({
      to: '.',
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        monat: shiftMonth(month, delta),
      })) as never,
      replace: true,
    });
  return [month, shift];
}
