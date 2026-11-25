import { daysBetween } from './date';
import type { Rhythm } from './schedule';

/** Payment processors that prefix the real merchant ("PAYPAL *MERCHANT 1234"). */
const PROCESSOR_PREFIX =
  /^(?:paypal|sumup|sq|zettle_?|stripe|adyen|mollie|klarna|payone|worldline)\s*\*\s*/u;

/**
 * Stable counterparty key of a bank line: lower-case, whitespace collapsed, processor prefix and
 * volatile digit runs (card/reference/date noise) removed. Idempotent, so the key of a stored key
 * is that key. Falls back to the plain key when nothing else would be left.
 */
export function counterpartyKey(raw: string): string {
  const plain = raw.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('de-AT');
  let text = plain;
  for (let before = ''; before !== text;) {
    before = text;
    text = text.replace(PROCESSOR_PREFIX, '');
  }
  text = text
    .replace(/\d{3,}/gu, ' ')
    .replace(/[#*]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return text || plain;
}

export interface OwnAccountRef {
  id: string;
  name: string;
  /** Full IBANs known for the account (any spacing). */
  ibans?: readonly string[];
  /** Last digits of an IBAN known only partially (at least four characters). */
  ibanTails?: readonly string[];
}

const compactIban = (s: string) => s.toUpperCase().replace(/[\s.-]/gu, '');

/**
 * Own-account transfer proposal for a bank line: the counterparty text contains the IBAN of
 * exactly one other own account, or equals (or contains as whole words) that account's name.
 * Ambiguity gives no proposal. Never applies anything.
 */
export function ownAccountTransferTarget(
  text: string,
  selfAccountId: string,
  accounts: readonly OwnAccountRef[],
): string | null {
  const others = accounts.filter((a) => a.id !== selfAccountId);
  const compact = compactIban(text);
  const shaped = (
    text.toUpperCase().match(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/gu) ?? []
  ).map(compactIban);
  const byIban = others.filter(
    (a) =>
      (a.ibans ?? []).some((iban) => {
        const full = compactIban(iban);
        return full.length >= 15 && compact.includes(full);
      }) ||
      (a.ibanTails ?? []).some((tail) => {
        const t = compactIban(tail);
        return t.length >= 4 && shaped.some((i) => i.endsWith(t));
      }),
  );
  if (byIban.length === 1) return byIban[0]!.id;
  if (byIban.length > 1) return null;
  const key = counterpartyKey(text);
  const padded = ` ${key.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
  const byName = others.filter((a) => {
    const name = counterpartyKey(a.name)
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
    if (!name) return false;
    return padded.trim() === name || (name.length >= 6 && padded.includes(` ${name} `));
  });
  return byName.length === 1 ? byName[0]!.id : null;
}

export interface RecurrenceEvent {
  date: string;
  /** Absolute or signed cents; only the magnitude counts. */
  amountCents: number;
}

export interface DetectedRecurrence {
  rhythm: Rhythm;
  /** Weekly only: every n weeks. */
  intervalWeeks: number | null;
  dueDay: number;
  dueMonth: number | null;
  /** Weekly only: the last seen date anchors the cycle. */
  startDate: string | null;
  amountCents: number;
  /** Largest deviation from `amountCents`; 0 for a fixed amount. */
  toleranceCents: number;
  count: number;
  lastDate: string;
}

/** Plausible day gaps per cadence (calendar-month length and weekend shifts included). */
const CADENCES = [
  { rhythm: 'weekly', intervalWeeks: 1, min: 6, max: 8 },
  { rhythm: 'weekly', intervalWeeks: 2, min: 13, max: 15 },
  { rhythm: 'monthly', intervalWeeks: null, min: 26, max: 35 },
  { rhythm: 'quarterly', intervalWeeks: null, min: 84, max: 98 },
  { rhythm: 'semiannual', intervalWeeks: null, min: 175, max: 190 },
  { rhythm: 'yearly', intervalWeeks: null, min: 355, max: 375 },
] as const;
const STEP_MONTHS = { quarterly: 3, semiannual: 6 } as const;
/** Amount tolerance for variable amounts (utilities, usage-based) in basis points. */
export const RECURRENCE_AMOUNT_TOLERANCE_BP = 1000;
export const RECURRENCE_MIN_OCCURRENCES = 3;

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : Math.floor((s[mid - 1]! + s[mid]!) / 2);
};

/**
 * Recurrence of one counterparty on one account and direction: at least three occurrences with
 * roughly regular gaps (weekly, fortnightly, monthly, quarterly, half-yearly, yearly), an amount
 * within ±10 % of the median (exact for fixed amounts) and a last occurrence not older than 1.5
 * cycles. Pure; `null` when anything fails.
 */
export function detectRecurrence(
  events: readonly RecurrenceEvent[],
  today: string,
): DetectedRecurrence | null {
  if (events.length < RECURRENCE_MIN_OCCURRENCES) return null;
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const gaps = sorted.slice(1).map((e, i) => daysBetween(sorted[i]!.date, e.date));
  const cadence = CADENCES.find((c) => gaps.every((g) => g >= c.min && g <= c.max));
  if (!cadence) return null;
  const amounts = sorted.map((e) => Math.abs(e.amountCents));
  const amount = median(amounts);
  if (amount <= 0) return null;
  const tolerance = Math.max(...amounts.map((a) => Math.abs(a - amount)));
  if (tolerance * 10_000 > amount * RECURRENCE_AMOUNT_TOLERANCE_BP) return null;
  const last = sorted[sorted.length - 1]!.date;
  if (daysBetween(last, today) > Math.floor((cadence.max * 3) / 2)) return null;
  const days = sorted.map((e) => Number(e.date.slice(8, 10)));
  const lastMonth = Number(last.slice(5, 7));
  const step = STEP_MONTHS[cadence.rhythm as keyof typeof STEP_MONTHS];
  return {
    rhythm: cadence.rhythm,
    intervalWeeks: cadence.rhythm === 'weekly' ? cadence.intervalWeeks : null,
    dueDay: cadence.rhythm === 'weekly' ? 1 : median(days),
    dueMonth: cadence.rhythm === 'yearly' ? lastMonth : step ? ((lastMonth - 1) % step) + 1 : null,
    startDate: cadence.rhythm === 'weekly' ? last : null,
    amountCents: amount,
    toleranceCents: tolerance,
    count: sorted.length,
    lastDate: last,
  };
}
