import { useSyncExternalStore } from 'react';

/** Zeitraum of the Vermögen registers (title block switch). Shared by the frame and the pages. */
export const WEALTH_PERIODS = ['1M', '3M', 'YTD', '1J', '3J', 'Alles'] as const;
export type WealthPeriod = (typeof WEALTH_PERIODS)[number];

let current: WealthPeriod = 'YTD';
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function setWealthPeriod(next: WealthPeriod): void {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

/** `[period, setPeriod]`, the same value in every component of the Vermögen area. */
export function useWealthPeriod(): readonly [WealthPeriod, (next: WealthPeriod) => void] {
  const period = useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
  return [period, setWealthPeriod] as const;
}
