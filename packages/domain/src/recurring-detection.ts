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

/** Words that alone say nothing about a counterparty: never a basis for loose matching. */
const GENERIC_WORDS = new Set([
  'dauerauftrag',
  'überweisung',
  'ueberweisung',
  'lastschrift',
  'gutschrift',
  'miete',
  'zahlung',
  'sepa',
  'einzahlung',
  'auszahlung',
  'abbuchung',
  'umbuchung',
  'rechnung',
  'gehalt',
]);

/** A loose key is usable when it has at least four characters and a non-generic word. */
export function looseKeyUsable(key: string): boolean {
  if (key.length < 4) return false;
  return key.split(/[^\p{L}\p{N}]+/u).some((w) => w !== '' && !GENERIC_WORDS.has(w));
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

/** Nominal day gap per cadence and how far a single gap may be early or late. */
const CADENCES = [
  { rhythm: 'weekly', intervalWeeks: 1, days: 7, tol: 2 },
  { rhythm: 'weekly', intervalWeeks: 2, days: 14, tol: 2 },
  { rhythm: 'monthly', intervalWeeks: null, days: 30, tol: 5 },
  { rhythm: 'quarterly', intervalWeeks: null, days: 91, tol: 7 },
  { rhythm: 'semiannual', intervalWeeks: null, days: 183, tol: 10 },
  { rhythm: 'yearly', intervalWeeks: null, days: 365, tol: 10 },
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

const within = (values: number[], middle: number) =>
  Math.max(...values.map((v) => Math.abs(v - middle)));
const steady = (values: number[]) => {
  const m = median(values);
  const dev = within(values, m);
  return m > 0 && dev * 10_000 <= m * RECURRENCE_AMOUNT_TOLERANCE_BP
    ? { amount: m, tolerance: dev }
    : null;
};

/**
 * Recurrence of one counterparty on one account and direction: at least three occurrences, the
 * cadence taken from the median gap (weekly, fortnightly, monthly, quarterly, half-yearly,
 * yearly), each gap early or late by the cadence's tolerance, one gap of twice the cadence allowed
 * (a skipped occurrence). The amount stays within ±10 % of the median; a single price change
 * is accepted when the last three amounts are steady. The last occurrence must be at most 1.5
 * cycles old. Pure; `null` when anything fails.
 */
export function detectRecurrence(
  events: readonly RecurrenceEvent[],
  today: string,
): DetectedRecurrence | null {
  if (events.length < RECURRENCE_MIN_OCCURRENCES) return null;
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const gaps = sorted.slice(1).map((e, i) => daysBetween(sorted[i]!.date, e.date));
  const mid = median(gaps);
  const cadence = CADENCES.find((c) => Math.abs(mid - c.days) <= c.tol);
  if (!cadence) return null;
  let skipped = 0;
  for (const g of gaps) {
    if (Math.abs(g - cadence.days) <= cadence.tol) continue;
    if (Math.abs(g - 2 * cadence.days) <= 2 * cadence.tol && ++skipped <= 1) continue;
    return null;
  }
  const amounts = sorted.map((e) => Math.abs(e.amountCents));
  const fit = steady(amounts) ?? steady(amounts.slice(-3));
  if (!fit) return null;
  const last = sorted[sorted.length - 1]!.date;
  if (daysBetween(last, today) > Math.floor(((cadence.days + cadence.tol) * 3) / 2)) return null;
  const days = sorted.map((e) => Number(e.date.slice(8, 10)));
  const lastMonth = Number(last.slice(5, 7));
  const step = STEP_MONTHS[cadence.rhythm as keyof typeof STEP_MONTHS];
  return {
    rhythm: cadence.rhythm,
    intervalWeeks: cadence.rhythm === 'weekly' ? cadence.intervalWeeks : null,
    dueDay: cadence.rhythm === 'weekly' ? 1 : median(days),
    dueMonth: cadence.rhythm === 'yearly' ? lastMonth : step ? ((lastMonth - 1) % step) + 1 : null,
    startDate: cadence.rhythm === 'weekly' ? last : null,
    amountCents: fit.amount,
    toleranceCents: fit.tolerance,
    count: sorted.length,
    lastDate: last,
  };
}
