import { useSyncExternalStore } from 'react';

/** How many months Plan › Monat shows side by side (Actual Budget style); 1 on the phone. */
export type MonthSpan = 1 | 2 | 3;

export const MONTH_SPANS: ReadonlyArray<MonthSpan> = [1, 2, 3];
const KEY = 'budget.plan.months';
const PHONE = '(max-width: 767px)';
const listeners = new Set<() => void>();

const isSpan = (value: unknown): value is MonthSpan => value === 1 || value === 2 || value === 3;

function read(): MonthSpan {
  try {
    const stored = Number(localStorage.getItem(KEY));
    return isSpan(stored) ? stored : 1;
  } catch {
    return 1;
  }
}

// The choice lives in memory and in localStorage (per browser); without storage it still holds
// for the visit.
let chosen: MonthSpan | undefined;
const snapshot = (): MonthSpan => (chosen ??= read());
const notify = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    chosen = read();
    notify();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function setMonthSpan(span: MonthSpan) {
  chosen = span;
  try {
    localStorage.setItem(KEY, String(span));
  } catch {
    // Not persisted.
  }
  notify();
}

/** The stored choice, regardless of the screen. */
export const useStoredMonthSpan = (): MonthSpan =>
  useSyncExternalStore(subscribe, snapshot, () => 1 as MonthSpan);

const subscribePhone = (listener: () => void) => {
  const query = window.matchMedia(PHONE);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};

/** The number of months actually shown: the stored choice, but always 1 on a phone. */
export function useMonthSpan(): MonthSpan {
  const stored = useStoredMonthSpan();
  return useIsPhone() ? 1 : stored;
}

/** True on a phone-sized screen (the plan then shows one month). */
export const useIsPhone = (): boolean =>
  useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
