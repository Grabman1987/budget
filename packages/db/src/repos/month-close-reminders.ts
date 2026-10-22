import {
  addMonths,
  lastDayOfMonth,
  monthCloseStateSchema,
  PriceUnavailableError,
  ExchangeRateUnavailableError,
  type MonthCloseState,
} from '@budget/domain';
import { like } from 'drizzle-orm';
import type { Db } from '../client';
import { appSetting } from '../schema';
import { MissingFxRateError } from './errors';
import { monthCloseReadContext, prepareMonthCloseSource } from './month-close-read';
import { monthCloseAuditCounts, monthCloseRevisionFromCount } from './month-close-state';
import { withReadSnapshotMemo } from './request-memo';
import { runWithValuationNotes } from './valuation-notes';

export interface MonthCloseReminder {
  id: string;
  kind: 'close' | 'close-changed';
  month: string;
  target: string;
}
export interface MonthCloseTaskRead {
  tasks: MonthCloseReminder[];
  unavailable: { month: string | null; reason: 'legacy' | 'invalid_state' | 'missing_price' | 'missing_fx' }[];
}
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const failureReason = (error: unknown): 'missing_price' | 'missing_fx' | null => {
  if (error instanceof PriceUnavailableError) return 'missing_price';
  if (error instanceof ExchangeRateUnavailableError || error instanceof MissingFxRateError) return 'missing_fx';
  return null;
};

/** Actual current-day close tasks; no GET writes, financial snapshots or historical valuation notes escape. */
export function readMonthCloseReminders(db: Db, today: string): MonthCloseTaskRead {
  // Private notes AND memo: a historical missing position must not become today's valuation warning.
  return runWithValuationNotes(() => db.transaction((tx) => withReadSnapshotMemo(tx, () => {
    const tasks: MonthCloseReminder[] = [], unavailable: MonthCloseTaskRead['unavailable'] = [];
    const states = new Map<string, MonthCloseState>();
    const invalid = new Set<string>();
    // app_setting has no soft-delete column: the existing audited entity deletion removes its row.
    const rows = tx.select().from(appSetting).where(like(appSetting.id, 'month_close.%')).all();
    for (const row of rows) {
      if (!row.id.startsWith('month_close.')) continue;
      const month = row.id.slice('month_close.'.length);
      if (!monthPattern.test(month)) {
        unavailable.push({ month: null, reason: 'invalid_state' });
        continue;
      }
      let value: unknown;
      try { value = JSON.parse(row.value); } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        invalid.add(month);
        unavailable.push({ month, reason: 'invalid_state' });
        continue;
      }
      const parsed = monthCloseStateSchema.safeParse(value);
      if (!parsed.success || (parsed.data.snapshot &&
        (!parsed.data.closedOn || parsed.data.snapshot.month !== month)) ||
        (parsed.success && parsed.data.closedOn && lastDayOfMonth(month) > today)) {
        invalid.add(month);
        unavailable.push({ month, reason: 'invalid_state' });
        continue;
      }
      states.set(month, parsed.data);
    }
    const previousMonth = addMonths(today.slice(0, 7), -1);
    const previous = states.get(previousMonth);
    if (!invalid.has(previousMonth) && !previous?.closedOn)
      tasks.push({ id: `close:${previousMonth}`, kind: 'close', month: previousMonth, target: `/monatsabschluss/${previousMonth}` });
    const comparable: string[] = [];
    for (const [month, state] of states) {
      if (!state.closedOn) continue;
      if (!state.snapshot) unavailable.push({ month, reason: 'legacy' });
      else comparable.push(month);
    }
    comparable.sort();
    if (comparable.length > 0) {
      let context: ReturnType<typeof monthCloseReadContext> | null = null;
      try { context = monthCloseReadContext(tx, comparable, today, states); } catch (error) {
        const reason = failureReason(error);
        if (!reason) throw error;
        comparable.forEach((month) => unavailable.push({ month, reason }));
      }
      if (context) {
        const prepared = new Map<string, ReturnType<typeof prepareMonthCloseSource>>();
        for (const month of comparable) {
          try { prepared.set(month, prepareMonthCloseSource(tx, month, today, context)); } catch (error) {
            const reason = failureReason(error);
            if (!reason) throw error;
            unavailable.push({ month, reason });
          }
        }
        const counts = monthCloseAuditCounts(tx, [...prepared].map(([month, source]) => ({
          month, accountIds: source.accounts.map((account) => account.id),
        })));
        for (const [month, source] of prepared) {
          const count = counts.get(month);
          if (count === undefined) throw new RangeError('Missing month audit count');
          const revision = monthCloseRevisionFromCount(month, source.revisionFacts, count);
          if (revision !== states.get(month)!.snapshot!.sourceRevision)
            tasks.push({ id: `close-changed:${month}`, kind: 'close-changed', month, target: `/monatsabschluss/${month}` });
        }
      }
    }
    tasks.sort((a, b) => a.month.localeCompare(b.month) || a.id.localeCompare(b.id));
    unavailable.sort((a, b) => (a.month ?? '').localeCompare(b.month ?? '') || a.reason.localeCompare(b.reason));
    return { tasks, unavailable };
  }))));
}
