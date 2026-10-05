import { AsyncLocalStorage } from 'node:async_hooks';
import {
  isIncompleteQuality,
  worstQuality,
  type IncompleteQuality,
  type IncompleteValuation,
} from '@budget/domain';
import { inArray } from 'drizzle-orm';
import { security } from '../schema';
import { runWithRequestMemo } from './request-memo';
import type { Executor } from './types';

/**
 * Valuation notes of one request: every valuation that had to estimate a position (cost basis, a
 * later price) or leave it out reports it here, and the API adds the merged list to the JSON answer
 * as `incomplete`, so the page can say "Bewertung teilweise geschätzt" instead of failing. Outside
 * `runWithValuationNotes` (scripts, tests) reporting is a no-op.
 */
const storage = new AsyncLocalStorage<Map<string, IncompleteValuation>>();
const rangeStorage = new AsyncLocalStorage<{ from: string; to: string }>();

/** Auxiliary historical reads must not flag positions sold before the displayed range. */
export function withValuationRange<T>(from: string, to: string, read: () => T): T {
  const parent = rangeStorage.getStore();
  return rangeStorage.run(
    {
      from: parent && parent.from > from ? parent.from : from,
      to: parent && parent.to < to ? parent.to : to,
    },
    read,
  );
}

/**
 * Run `fn` with a fresh collection of valuation notes; `fn` gets a reader that returns the merged
 * notes so far (call it once the work is done).
 */
export function runWithValuationNotes<T>(fn: (notes: () => ValuationNote[]) => T): T {
  const store = new Map<string, IncompleteValuation>();
  // The same scope memoises valuations (a memoised valuation has already reported its notes here).
  return runWithRequestMemo(() => storage.run(store, () => fn(() => mergeNotes(store.values()))));
}

/** Report estimated or missing positions to the current request, if one is collecting. */
export function noteIncomplete(items: ReadonlyArray<IncompleteValuation>): void {
  const store = storage.getStore();
  if (!store || items.length === 0) return;
  for (const item of items) {
    const range = rangeStorage.getStore();
    if (range && (item.to < range.from || item.from > range.to)) continue;
    const key = `${item.accountId}\0${item.securityId}\0${item.quality}`;
    const known = store.get(key);
    if (!known) store.set(key, { ...item });
    else {
      known.days = Math.max(known.days, item.days);
      if (item.from < known.from) known.from = item.from;
      if (item.to > known.to) known.to = item.to;
    }
  }
}

/** One security with an estimated or missing valuation, merged over accounts. */
export interface ValuationNote {
  securityId: string;
  quality: IncompleteQuality;
  /** First and last day affected. */
  from: string;
  to: string;
}

function mergeNotes(items: Iterable<IncompleteValuation>): ValuationNote[] {
  const bySecurity = new Map<string, ValuationNote>();
  for (const item of items) {
    const known = bySecurity.get(item.securityId);
    if (!known) {
      bySecurity.set(item.securityId, {
        securityId: item.securityId,
        quality: item.quality,
        from: item.from,
        to: item.to,
      });
      continue;
    }
    const worst = worstQuality(known.quality, item.quality);
    known.quality = isIncompleteQuality(worst) ? worst : known.quality;
    if (item.from < known.from) known.from = item.from;
    if (item.to > known.to) known.to = item.to;
  }
  return [...bySecurity.values()].sort((a, b) => a.securityId.localeCompare(b.securityId));
}

/** Names for the notes (the UI lists them in a tooltip). */
export function namedNotes(
  db: Executor,
  notes: ReadonlyArray<ValuationNote>,
): Array<ValuationNote & { name: string }> {
  if (notes.length === 0) return [];
  const names = new Map(
    db
      .select({ id: security.id, name: security.name })
      .from(security)
      .where(
        inArray(
          security.id,
          notes.map((n) => n.securityId),
        ),
      )
      .all()
      .map((r) => [r.id, r.name]),
  );
  return notes.map((n) => ({ ...n, name: names.get(n.securityId) ?? '' }));
}
