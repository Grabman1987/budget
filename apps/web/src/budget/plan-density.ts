import { useSyncExternalStore } from 'react';

export type PlanDensity = 'all' | 'compact' | 'minimal';
const KEY = 'budget.plan.density';
const listeners = new Set<() => void>();
let chosen: PlanDensity | undefined;
const valid = (value: unknown): value is PlanDensity =>
  value === 'all' || value === 'compact' || value === 'minimal';
function read(): PlanDensity {
  try {
    const value = localStorage.getItem(KEY);
    return valid(value) ? value : 'all';
  } catch {
    return 'all';
  }
}
const notify = () => listeners.forEach((listener) => listener());
function subscribe(listener: () => void) {
  listeners.add(listener);
  const storage = (event: StorageEvent) => {
    if (event.key !== KEY && event.key !== null) return;
    chosen = read();
    notify();
  };
  window.addEventListener('storage', storage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', storage);
  };
}
export function setPlanDensity(value: PlanDensity) {
  chosen = value;
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Keep the preference for this visit when storage is unavailable.
  }
  notify();
}
export const usePlanDensity = () =>
  useSyncExternalStore(
    subscribe,
    () => (chosen ??= read()),
    () => 'all' as PlanDensity,
  );
