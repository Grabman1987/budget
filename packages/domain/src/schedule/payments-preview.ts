import { cents } from '../money';
import { addMonths, lastDayOfMonth, monthOf } from '../date';
import { dueDates } from './due-dates';
import {
  occurrences,
  versionOn,
  type OccurrenceStatus,
  type SchedulePayment,
  type ScheduleVersion,
} from './occurrences';

export interface PreviewPayment extends SchedulePayment {
  id: string;
  name: string;
  categoryName: string | null;
  categoryClass: string | null;
  categoryKind: string | null;
  versions: Array<ScheduleVersion & { currency: string }>;
}
export interface PreviewStored {
  paymentId: string;
  dueDate: string;
  occurrenceId: string;
  status: OccurrenceStatus;
  /** Stored occurrences have no currency. Never relabel this with a current version's currency. */
  storedExpectedCents: number;
  bookingId: string | null;
  bookedAmountCents: number | null;
  bookedCurrency: string | null;
}
export interface PreviewAmount {
  baseCents: number;
  upperCents: number;
}
export interface PreviewEvent {
  paymentId: string;
  dueDate: string;
  currency: string | null;
  contract: PreviewAmount | null;
  stored: PreviewStored | null;
}
export interface PreviewRow {
  paymentId: string;
  name: string;
  categoryName: string | null;
  categoryClass: string | null;
  periodic: boolean;
  currency: string | null;
  months: Array<PreviewAmount | null>;
  total: PreviewAmount | null;
  events: PreviewEvent[];
}
export interface PreviewCurrency {
  currency: string;
  months: PreviewAmount[];
  periodicMonths: PreviewAmount[];
  total: PreviewAmount;
  periodicTotal: PreviewAmount;
  average: PreviewAmount;
  highestMonth: string | null;
}
export interface PaymentsPreview {
  asOf: string;
  from: string;
  to: string;
  months: string[];
  rows: PreviewRow[];
  currencies: PreviewCurrency[];
  unavailableCount: number;
  eurComplete: boolean;
}
export function paymentsPreviewWindow(asOf: string) {
  const months = Array.from({ length: 12 }, (_, i) => addMonths(monthOf(asOf), i + 1));
  return { months, from: `${months[0]}-01`, to: lastDayOfMonth(months[11]!) };
}
const zero = (): PreviewAmount => ({ baseCents: 0, upperCents: 0 });
const add = (a: PreviewAmount, b: PreviewAmount) => {
  a.baseCents = cents(a.baseCents + b.baseCents);
  a.upperCents = cents(a.upperCents + b.upperCents);
};
const sum = (values: PreviewAmount[]) =>
  values.reduce((a, b) => {
    add(a, b);
    return a;
  }, zero());

/** Read projection of outflow contracts, with stored status overlaid by exact payment/date identity.
 * Linked bookings are metadata, never another forecast payment. No FX forecast is assumed. */
export function paymentsPreview(
  asOf: string,
  payments: PreviewPayment[],
  stored: PreviewStored[],
): PaymentsPreview {
  const window = paymentsPreviewWindow(asOf);
  const rows: PreviewRow[] = [];
  const groups = new Map<string, PreviewCurrency>();
  let unavailableCount = 0;
  for (const p of payments.filter((p) => p.kind === 'outflow')) {
    const saved = new Map(
      stored
        .filter((s) => s.paymentId === p.id && s.dueDate >= window.from && s.dueDate <= window.to)
        .map((s) => [s.dueDate, s]),
    );
    const projected = new Map(
      occurrences(p, p.versions, window.from, window.to).map((o) => [o.dueDate, o]),
    );
    const dates = [
      ...new Set([
        ...dueDates(p, window.from, window.to).filter(
          (day) => p.versions.length === 0 || versionOn(p.versions, day),
        ),
        ...saved.keys(),
      ]),
    ]
      .filter((day) => saved.get(day)?.status !== 'skipped')
      .sort();
    const paymentRows = new Map<string | null, PreviewRow>();
    for (const dueDate of dates) {
      const version = versionOn(p.versions, dueDate);
      const occurrence = projected.get(dueDate);
      // A saved date outside the current schedule has no current contract occurrence.
      const currency = occurrence && version ? version.currency : null;
      const contract = occurrence
        ? {
            baseCents: Math.abs(occurrence.amountCents),
            upperCents: Math.abs(occurrence.amountMaxCents ?? occurrence.amountCents),
          }
        : null;
      const event: PreviewEvent = {
        paymentId: p.id,
        dueDate,
        currency,
        contract,
        stored: saved.get(dueDate) ?? null,
      };
      let row = paymentRows.get(currency);
      if (!row) {
        row = {
          paymentId: p.id,
          name: p.name,
          categoryName: p.categoryName,
          categoryClass: p.categoryClass,
          periodic: p.categoryKind === 'periodic',
          currency,
          months: window.months.map(zero),
          total: zero(),
          events: [],
        };
        paymentRows.set(currency, row);
      }
      row.events.push(event);
      const index = window.months.indexOf(monthOf(dueDate));
      if (!contract || !currency) {
        unavailableCount += 1;
        row.months[index] = null;
        row.total = null;
        continue;
      }
      add(row.months[index]!, contract);
      add(row.total!, contract);
      let group = groups.get(currency);
      if (!group) {
        group = {
          currency,
          months: window.months.map(zero),
          periodicMonths: window.months.map(zero),
          total: zero(),
          periodicTotal: zero(),
          average: zero(),
          highestMonth: null,
        };
        groups.set(currency, group);
      }
      add(group.months[index]!, contract);
      if (row.periodic) add(group.periodicMonths[index]!, contract);
    }
    rows.push(...paymentRows.values());
  }
  if (!groups.has('EUR'))
    groups.set('EUR', {
      currency: 'EUR',
      months: window.months.map(zero),
      periodicMonths: window.months.map(zero),
      total: zero(),
      periodicTotal: zero(),
      average: zero(),
      highestMonth: null,
    });
  for (const g of groups.values()) {
    g.total = sum(g.months);
    g.periodicTotal = sum(g.periodicMonths);
    g.average = {
      baseCents: Math.round(g.total.baseCents / 12),
      upperCents: Math.round(g.total.upperCents / 12),
    };
    const max = Math.max(...g.months.map((m) => m.baseCents));
    g.highestMonth =
      max > 0 ? window.months[g.months.findIndex((m) => m.baseCents === max)]! : null;
  }
  const merged = new Map<string, PreviewRow>();
  for (const row of rows) {
    const key = `${row.paymentId}:${row.currency}`;
    const old = merged.get(key);
    if (!old) {
      merged.set(key, row);
      continue;
    }
    old.events.push(...row.events);
    old.months = old.months.map((v, i) => {
      const n = row.months[i];
      if (v === null || n === null) return null;
      return {
        baseCents: cents(v.baseCents + (n?.baseCents ?? 0)),
        upperCents: cents(v.upperCents + (n?.upperCents ?? 0)),
      };
    });
    old.total =
      old.total === null || row.total === null
        ? null
        : {
            baseCents: cents(old.total.baseCents + row.total.baseCents),
            upperCents: cents(old.total.upperCents + row.total.upperCents),
          };
  }
  rows.splice(0, rows.length, ...merged.values());
  const order = ['need', 'want', 'future'];
  rows.sort(
    (a, b) =>
      ((order.indexOf(a.categoryClass ?? '') + 4) % 4) -
        ((order.indexOf(b.categoryClass ?? '') + 4) % 4) ||
      Number(a.periodic) - Number(b.periodic) ||
      a.name.localeCompare(b.name) ||
      (a.currency ?? '').localeCompare(b.currency ?? ''),
  );
  return {
    asOf,
    ...window,
    rows,
    currencies: [...groups.values()].sort((a, b) =>
      a.currency === 'EUR' ? -1 : b.currency === 'EUR' ? 1 : a.currency.localeCompare(b.currency),
    ),
    unavailableCount,
    eurComplete: unavailableCount === 0 && [...groups.keys()].every((c) => c === 'EUR'),
  };
}

export interface PlannedPreviewSource {
  id: string;
  name: string;
  date: string;
  amountCents: number;
  currency: string;
  sourceAccountId: string | null;
  targetAccountId: string | null;
  source: 'savings' | 'transfer';
  /** Exact live booking identity if present; never use display names as identity. */
  bookingId?: string;
}
/** A stored transfer wins over a schedule for the identical source/destination/date/amount.
 * Each transfer consumes at most one schedule: two independent identical plans are not collapsed. */
export function deduplicatePreviewSources(
  sources: ReadonlyArray<PlannedPreviewSource>,
): PlannedPreviewSource[] {
  const key = (s: PlannedPreviewSource) =>
    `${s.sourceAccountId}|${s.targetAccountId}|${s.date}|${s.currency}|${s.amountCents}`;
  const booked = sources.filter((s) => s.source === 'transfer');
  const consumed = new Set<string>();
  return [
    ...booked,
    ...sources
      .filter((s) => s.source === 'savings')
      .filter((s) => {
        if (!s.sourceAccountId || !s.targetAccountId) return true;
        const match = booked.find((b) => !consumed.has(b.id) && key(b) === key(s));
        if (!match) return true;
        consumed.add(match.id);
        return false;
      }),
  ];
}
