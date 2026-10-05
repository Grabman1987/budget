import { formatPrivateEuro as formatEuro } from '@budget/ui';
import { addDays, daysBetween, cents as toCents } from '@budget/domain';
import { eurOf, type ExpectedPayment, type Occurrence, type Rhythm } from './api';

/** Presentation rules of Plan › Erwartet. The figures themselves come from the API. */

export const RHYTHM_LABEL: Record<Rhythm, string> = {
  weekly: 'wöchentlich',
  monthly: 'monatlich',
  quarterly: 'vierteljährlich',
  semiannual: 'halbjährlich',
  yearly: 'jährlich',
};

export const STATUS_LABEL = {
  expected: 'erwartet',
  received: 'eingegangen',
  deviating: 'abweichend',
  missed: 'ausgefallen',
} as const;

const SYMBOL: Record<string, string> = { USD: '$', GBP: '£', CHF: 'CHF' };

/** `1.234,56 €`, or the original currency (`20,00 $`, `12,00 CHF`). */
export function money(value: number, currency = 'EUR', sign = false): string {
  if (currency === 'EUR') return formatEuro(toCents(value), { sign });
  const text = formatEuro(toCents(value), { sign }).replace(/ €$/, '');
  return `${text} ${SYMBOL[currency] ?? currency}`;
}

/** Only what needs action is red: a booking that deviates after the due date, or a missed one. */
export function needsAction(row: Pick<Occurrence, 'status' | 'dueDate'>, today: string): boolean {
  return row.status === 'missed' || (row.status === 'deviating' && row.dueDate < today);
}

/** Monday of the week of `day` (weeks run Monday to Sunday). */
export function weekMonday(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7));
}

const shortDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;

/** `14.–20.09.` or `28.09.–04.10.` */
export function weekRange(monday: string): string {
  const sunday = addDays(monday, 6);
  return monday.slice(5, 7) === sunday.slice(5, 7)
    ? `${monday.slice(8, 10)}.–${shortDay(sunday)}`
    : `${shortDay(monday)}–${shortDay(sunday)}`;
}

export interface WeekGroup {
  key: string;
  title: string;
  /** The range of days, next to the title. */
  sub: string;
  rows: Occurrence[];
  /** Signed EUR sum of the rows that have a rate. */
  sumCents: number;
  /** Rows in a foreign currency without a known rate are not in the sum. */
  leftOut: number;
}

/**
 * Baugruppen of the 90-day list: one assembly per week with its sum, preceded by "Überfällig"
 * for earlier occurrences that are still open. Earlier ones that arrived or were dropped are
 * not shown again.
 */
export function weekGroups(
  rows: ReadonlyArray<Occurrence>,
  today: string,
  rates: Record<string, number>,
): WeekGroup[] {
  const thisWeek = weekMonday(today);
  const groups = new Map<string, WeekGroup>();
  const add = (key: string, title: string, sub: string, row: Occurrence) => {
    const group = groups.get(key) ?? { key, title, sub, rows: [], sumCents: 0, leftOut: 0 };
    group.rows.push(row);
    const value = eurOf(row.amountCents, row.currency, rates);
    if (value === null) group.leftOut += 1;
    else group.sumCents += value;
    groups.set(key, group);
  };
  const sorted = [...rows].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name, 'de'),
  );
  for (const row of sorted) {
    const monday = weekMonday(row.dueDate);
    if (row.dueDate < today && monday < thisWeek) {
      if (row.status === 'received') continue;
      add('overdue', 'Überfällig', 'noch offen', row);
      continue;
    }
    const weeks = daysBetween(thisWeek, monday) / 7;
    const title =
      weeks === 0 ? 'Diese Woche' : weeks === 1 ? 'Nächste Woche' : `In ${weeks} Wochen`;
    add(monday, title, weekRange(monday), row);
  }
  const overdue = groups.get('overdue');
  groups.delete('overdue');
  return [...(overdue ? [overdue] : []), ...groups.values()];
}

/** `monatlich am 15.`, `jährlich am 12.04.`, `vierteljährlich ab Jänner, am letzten Werktag` */
export function cadenceText(
  p: Pick<ExpectedPayment, 'rhythm' | 'dueDay' | 'dueMonth' | 'dateShift'>,
) {
  const MONTHS = [
    'Jänner',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ];
  const lastBusinessDay = p.dueDay === 31 && p.dateShift === 'before';
  const day = lastBusinessDay
    ? 'am letzten Werktag'
    : p.dueDay === 31
      ? 'am Monatsletzten'
      : `am ${p.dueDay}.`;
  if (p.rhythm === 'weekly') return 'w?chentlich';
  if (p.rhythm === 'monthly') return `monatlich ${day}`;
  const month = p.dueMonth ?? 1;
  if (p.rhythm === 'yearly')
    return lastBusinessDay || p.dueDay === 31
      ? `jährlich ${day} im ${MONTHS[month - 1]}`
      : `jährlich am ${p.dueDay}.${String(month).padStart(2, '0')}.`;
  return `${RHYTHM_LABEL[p.rhythm]} ab ${MONTHS[month - 1]}, ${day}`;
}

export interface ContractGroup {
  key: string;
  title: string;
  rows: ExpectedPayment[];
  /** Monthly and yearly equivalents in EUR (rows without a rate are left out). */
  monthlyCents: number;
  yearlyCents: number;
  leftOut: number;
}

/**
 * Stückliste of the payments: one assembly per category group (incomes form their own "Einnahmen"
 * assembly, payments without a category "Ohne Kategorie"), sums in EUR.
 */
export function contractGroups(
  payments: ReadonlyArray<ExpectedPayment>,
  groupOf: (categoryId: string | null) => { id: string; name: string } | null,
  rates: Record<string, number>,
): ContractGroup[] {
  const groups = new Map<string, ContractGroup>();
  for (const p of payments) {
    const g = p.kind === 'inflow' ? { id: 'income', name: 'Einnahmen' } : groupOf(p.categoryId);
    const key = g?.id ?? 'none';
    const group = groups.get(key) ?? {
      key,
      title: g?.name ?? 'Ohne Kategorie',
      rows: [],
      monthlyCents: 0,
      yearlyCents: 0,
      leftOut: 0,
    };
    group.rows.push(p);
    const currency = p.version?.currency ?? 'EUR';
    const monthly =
      p.monthlyEquivalentCents === null ? 0 : eurOf(p.monthlyEquivalentCents, currency, rates);
    const yearly =
      p.yearlyEquivalentCents === null ? 0 : eurOf(p.yearlyEquivalentCents, currency, rates);
    if (monthly === null || yearly === null) group.leftOut += 1;
    else {
      group.monthlyCents += monthly;
      group.yearlyCents += yearly;
    }
    groups.set(key, group);
  }
  const list = [...groups.values()];
  for (const g of list) g.rows.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  // Einnahmen first, the rest by the larger yearly burden.
  return list.sort((a, b) =>
    a.key === 'income' ? -1 : b.key === 'income' ? 1 : a.yearlyCents - b.yearlyCents,
  );
}

/** A revision letter for the n-th version (A, B, … Z, then numbers). */
export const versionLetter = (index: number) =>
  index < 26 ? String.fromCharCode(65 + index) : String(index + 1);

/** `1.234,56 €` of a version; a range reads `800,00 € bis 950,00 €`. */
export function versionAmount(v: {
  amountCents: number;
  amountMaxCents: number | null;
  currency: string;
}) {
  return v.amountMaxCents !== null
    ? `${money(v.amountCents, v.currency)} bis ${money(v.amountMaxCents, v.currency)}`
    : money(v.amountCents, v.currency);
}

/** Positive cents to the signed amount of a kind. */
export const signed = (kind: 'inflow' | 'outflow', value: number) =>
  kind === 'outflow' ? -value : value;

/**
 * A contract or subscription: an outflow that is not saving. Payments into the class Zukunft
 * (Notgroschen, ETF-Sparplan, Sondertilgung) and yearly set-asides for wants (Reisen, Geschenke)
 * are plans, not contracts; "Alle" shows them too.
 */
export function isContract(
  kind: 'inflow' | 'outflow',
  category: { kind: string; class: string | null } | null,
): boolean {
  if (kind !== 'outflow') return false;
  if (!category) return true;
  if (category.class === 'future') return false;
  return !(category.kind === 'periodic' && category.class === 'want');
}
