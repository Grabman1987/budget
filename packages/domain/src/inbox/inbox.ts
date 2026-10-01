import { cents, formatEuro } from '../money';

const eur = (value: number): string => formatEuro(cents(value));

/**
 * Posteingang rules, pure: the Baugruppen and their order, how long the list takes, the category
 * suggestion for an uncategorised booking, when a manual value is stale, and the German wording of
 * the items the generator opens. The generator itself (`refreshInbox`) lives in `@budget/db`.
 */

export const INBOX_GROUP_IDS = [
  'over',
  'uncat',
  'transfer',
  'version',
  'stale',
  'consent',
  'rules',
  'other',
] as const;
export type InboxGroupId = (typeof INBOX_GROUP_IDS)[number];

export interface InboxGroupDef {
  id: InboxGroupId;
  title: string;
  sub: string;
}

/** The Baugruppen in display order; the number of a group is its index plus one. */
export const INBOX_GROUPS: ReadonlyArray<InboxGroupDef> = [
  { id: 'over', title: 'Überziehung', sub: 'im Plan decken' },
  { id: 'uncat', title: 'Ohne Kategorie', sub: 'Vorschlag aus Empfänger und Verlauf' },
  { id: 'transfer', title: 'Mögliche Umbuchung', sub: 'zwei Buchungen, gleicher Betrag' },
  { id: 'version', title: 'Erwartete Zahlung weicht ab', sub: 'neue Version ab einem Monat' },
  { id: 'stale', title: 'Veralteter Wert', sub: 'manuell gepflegte Konten' },
  { id: 'consent', title: 'Bank-Einwilligung', sub: 'alle 180 Tage erneuern' },
  { id: 'rules', title: 'Regeln', sub: 'Handlungsbedarf laut Regelwerk' },
  { id: 'other', title: 'Sonstiges', sub: 'weitere offene Punkte' },
];

/** Default threshold for manual values (days since the last value). */
export const STALE_VALUE_DAYS = 30;
/** Minutes per open item in the head line; at least one minute for a non-empty list. */
const MINUTES_PER_ITEM = 0.7;

/**
 * The Baugruppe of an item. Items of P4 (bank consent, imports, possible transfers) and anything
 * unknown are placed generically: a possible transfer is an `import` item with `ref_type`
 * `transfer`, every other import item is "Sonstiges".
 */
export function inboxGroupOf(kind: string, refType: string | null): InboxGroupId {
  switch (kind) {
    case 'overspent':
      return 'over';
    case 'uncategorized':
      return 'uncat';
    case 'expected_payment':
      return 'version';
    case 'stale_value':
      return 'stale';
    case 'consent':
      return 'consent';
    case 'revision':
      return 'rules';
    case 'import':
      return refType === 'transfer' ? 'transfer' : 'other';
    default:
      return 'other';
  }
}

/** "etwa m Minuten": 0,7 min per item, at least 1 (0 for an empty list). */
export function inboxMinutes(count: number): number {
  return count <= 0 ? 0 : Math.max(1, Math.round(count * MINUTES_PER_ITEM));
}

/**
 * Category suggestion of an uncategorised booking: the payee's default category, else the category
 * the payee's recent bookings used most often (a tie goes to the one used most recently).
 * `recent` lists category ids newest first.
 */
export function suggestCategory(
  defaultCategoryId: string | null,
  recent: ReadonlyArray<string>,
): string | null {
  if (defaultCategoryId !== null) return defaultCategoryId;
  const counts = new Map<string, number>();
  for (const id of recent) counts.set(id, (counts.get(id) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const id of recent) {
    const n = counts.get(id) ?? 0;
    if (n > bestCount) {
      best = id;
      bestCount = n;
    }
  }
  return best;
}

/** A manual value is stale when its last update is more than `thresholdDays` days old. */
export const isStaleValue = (daysOld: number, thresholdDays: number = STALE_VALUE_DAYS): boolean =>
  daysOld > thresholdDays;

const MONTH_NAMES = [
  'Januar',
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
const monthName = (month: string): string => MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month;
/** `15.09.` of `2026-09-15`. */
const shortDay = (day: string): string => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;

export interface ItemText {
  title: string;
  detail: string;
}

export const overspentText = (categoryName: string, overspentCents: number): ItemText => ({
  title: `${categoryName} ist überzogen`,
  detail: `${eur(-Math.abs(overspentCents))} · im Plan aus einem anderen Envelope decken`,
});

export const uncategorizedText = (
  payeeName: string | null,
  amountCents: number,
  day: string,
  accountName: string,
): ItemText => ({
  title: `${payeeName ?? 'Ohne Empfänger'} · ${eur(amountCents)}`,
  detail: `${shortDay(day)} · ${accountName}`,
});

export const versionText = (
  paymentName: string,
  fromMonth: string,
  newCents: number,
  oldCents: number,
): ItemText => ({
  title: `${paymentName}: neuer Betrag ab ${monthName(fromMonth)}`,
  detail: `${eur(Math.abs(newCents))} statt ${eur(Math.abs(oldCents))} laut letzter Buchung`,
});

export const missedText = (paymentName: string, dueDate: string): ItemText => ({
  title: `${paymentName}: Zahlung fehlt`,
  detail: `fällig am ${shortDay(dueDate)} · bisher keine passende Buchung`,
});

export const staleText = (name: string, daysOld: number, valueCents: number): ItemText => ({
  title: `${name}: Wert seit ${daysOld} Tagen nicht aktualisiert`,
  detail: `zuletzt ${eur(valueCents)} · manuell`,
});

export const revisionText = (
  code: string,
  name: string,
  valueText: string | null,
  actionText: string | null,
): ItemText => ({
  title: `${code} ${name}${valueText ? `: ${valueText}` : ''}`,
  detail: actionText ?? 'Handlungsbedarf laut Regelwerk',
});

/** "Ab Oktober übernehmen": the label of the version action. */
export const versionActionLabel = (fromMonth: string): string =>
  `Ab ${monthName(fromMonth)} übernehmen`;
export { monthName as germanMonthName };
