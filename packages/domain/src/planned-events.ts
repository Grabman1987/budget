import { lastDayOfMonth, monthOf } from './date';
import { planYearMonths } from './budget-year';

export const EVENT_RECURRENCES = ['once', 'monthly', 'quarterly', 'yearly', 'months'] as const;
export type EventRecurrence = (typeof EVENT_RECURRENCES)[number];

export interface PlannedEvent {
  id: string;
  name: string;
  date: string;
  amountCents: number;
  categoryId: string | null;
  enabled: boolean;
  recurrence: EventRecurrence;
  recurrenceMonths: readonly number[];
  recurrenceUntil: string | null;
}
export interface PlannedEventOccurrence {
  eventId: string;
  name: string;
  date: string;
  amountCents: number;
  categoryId: string | null;
}

/** Inclusive calendar expansion, anchored to the original day (no February drift).
 * Enabled/account eligibility belongs to the caller; disabled plans remain visible in the grid.
 */
export function plannedEventOccurrences(
  event: PlannedEvent,
  from: string,
  to: string,
): PlannedEventOccurrence[] {
  const end = event.recurrenceUntil && event.recurrenceUntil < to ? event.recurrenceUntil : to;
  const first = monthOf(event.date);
  const start = from > event.date ? from : event.date;
  if (end < start) return [];
  const anchor = Number(first.slice(0, 4)) * 12 + Number(first.slice(5));
  const startIndex = Number(start.slice(0, 4)) * 12 + Number(start.slice(5, 7)) - 1;
  const endIndex = Number(end.slice(0, 4)) * 12 + Number(end.slice(5, 7)) - 1;
  // Numeric bounds also terminate at the last supported year, 9999.
  const months = Array.from({ length: endIndex - startIndex + 1 }, (_, i) => {
    const index = startIndex + i;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  });
  return months.flatMap((month) => {
    const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5));
    const distance = index - anchor;
    const repeats =
      event.recurrence === 'once'
        ? distance === 0
        : event.recurrence === 'monthly'
          ? true
          : event.recurrence === 'quarterly'
            ? distance % 3 === 0
            : event.recurrence === 'yearly'
              ? distance % 12 === 0
              : event.recurrenceMonths.includes(Number(month.slice(5)));
    const date = `${month}-${String(Math.min(Number(event.date.slice(8)), Number(lastDayOfMonth(month).slice(8)))).padStart(2, '0')}`;
    return repeats && date >= start && date <= end
      ? [
          {
            eventId: event.id,
            name: event.name,
            date,
            amountCents: event.amountCents,
            categoryId: event.categoryId,
          },
        ]
      : [];
  });
}

/** Unpersisted overlay on stored Zu verteilen. Only dates after asOf count, avoiding replay of
 * past plans on top of actuals. No income extrapolation, envelope funding or booking creation.
 */
export function planYearScenario(
  year: number,
  baseline: ReadonlyArray<{ month: string; toBeAssignedCents: number }>,
  events: readonly PlannedEvent[],
  selectedIds: readonly string[],
  asOf: string,
) {
  const months = planYearMonths(year);
  const source = new Map(baseline.map((m) => [m.month, m.toBeAssignedCents]));
  if (baseline.length !== 12 || source.size !== 12 || months.some((m) => !source.has(m)))
    throw new RangeError('A scenario needs twelve distinct baseline months');
  const selected = new Set(selectedIds);
  const occurrences = events
    .filter((e) => e.enabled && selected.has(e.id))
    .flatMap((e) => plannedEventOccurrences(e, `${year}-01-01`, `${year}-12-31`))
    .filter((o) => o.date > asOf);
  let effectCents = 0;
  const rows = months.map((month) => {
    const eventCents = occurrences
      .filter((o) => monthOf(o.date) === month)
      .reduce((sum, o) => sum + o.amountCents, 0);
    effectCents += eventCents;
    const withoutCents = source.get(month)!;
    return { month, withoutCents, eventCents, effectCents, withCents: withoutCents + effectCents };
  });
  return { months: rows, yearEnd: rows[11]! };
}
