import { useEffect, useSyncExternalStore } from 'react';

/**
 * Rows that were just created or changed flash once (`tx-in`, 420 ms tint). A row registers its
 * id here when a write starts; the row plays the animation when it renders and then consumes the
 * id. Ids nobody renders (filtered out, other page) expire on their own.
 */
const pending = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const EXPIRE_MS = 10_000;
const PLAY_MS = 520;

export function flashRows(ids: ReadonlyArray<string>): void {
  for (const id of ids) {
    pending.add(id);
    setTimeout(() => {
      if (pending.delete(id)) notify();
    }, EXPIRE_MS);
  }
  notify();
}

/** True while the row should carry the flash class. */
export function useFlashing(id: string): boolean {
  const on = useSyncExternalStore(
    subscribe,
    () => pending.has(id),
    () => false,
  );
  useEffect(() => {
    if (!on) return;
    const timer = setTimeout(() => {
      if (pending.delete(id)) notify();
    }, PLAY_MS);
    return () => clearTimeout(timer);
  }, [on, id]);
  return on;
}

/** Test helper: forget everything pending. */
export function resetFlash(): void {
  pending.clear();
  notify();
}
