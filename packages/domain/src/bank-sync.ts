/** Parse decimal bank amounts without binary floating point. */
export function bankCents(value: string): number {
  if (!/^-?\d{1,14}(?:\.\d{1,2})?$/.test(value)) throw new RangeError('Invalid bank amount');
  const [whole = '0', fraction = ''] = value.replace('-', '').split('.');
  const cents =
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (value.startsWith('-') ? -1n : 1n);
  const result = Number(cents);
  if (!Number.isSafeInteger(result)) throw new RangeError('Bank amount exceeds safe cents');
  return result;
}

export interface BankTransaction {
  /** Legacy synthetic adapters omit this; the HTTP adapter always supplies it. */
  bankStatus?: 'booked' | 'pending';
  reference: string | null;
  date: string;
  amountCents: number;
  currency: string;
  memo: string;
  rawPayee?: string | null;
}

export interface MatchBooking {
  id: string;
  accountId: string;
  date: string;
  amountCents: number;
  currency: string;
}

/** Calendar-day distance; posting delays must not depend on daylight saving time. */
function dayGap(a: string, b: string): number {
  return Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86_400_000;
}

/** Calendar days, inclusive. */
export function withinBankWindow(a: string, b: string): boolean {
  return dayGap(a, b) <= 5;
}

/**
 * Window for linking a bank line to an existing booking without asking. One day narrower than the
 * suggestion window above: a card purchase entered on a Friday posts by Tuesday at the latest, and
 * a wrong automatic link is worse than an open question.
 */
export const BANK_AUTO_LINK_DAYS = 4;

export interface BankLine {
  /** Caller's identifier of the bank line, unique within one call. */
  key: string;
  accountId: string;
  date: string;
  amountCents: number;
  currency: string;
}

export type BankLineMatch =
  | { kind: 'linked'; bookingId: string }
  | { kind: 'ambiguous'; bookingIds: string[] }
  | { kind: 'none' };

/**
 * Decide, per bank line, which existing booking it already is. The caller passes only bookings
 * that carry no bank link yet. Same account, currency and amount, at most BANK_AUTO_LINK_DAYS
 * apart:
 * - exactly one booking: linked; when several lines claim the same booking the nearest date wins
 *   (then input order) and the others count as new;
 * - several bookings: ambiguous, nothing is decided for the owner. Identical lines (same day and
 *   amount) that face exactly as many identical candidates pair off in order instead;
 * - none: not present yet.
 * A booking is never assigned to two lines.
 */
export function matchBankLines(
  lines: readonly BankLine[],
  bookings: readonly MatchBooking[],
): Map<string, BankLineMatch> {
  const gap = (l: BankLine, b: MatchBooking) => dayGap(l.date, b.date);
  const candidates = lines.map((l) =>
    bookings
      .filter(
        (b) =>
          b.accountId === l.accountId &&
          b.currency === l.currency &&
          b.amountCents === l.amountCents &&
          gap(l, b) <= BANK_AUTO_LINK_DAYS,
      )
      .sort(
        (a, b) => gap(l, a) - gap(l, b) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
      ),
  );
  const result = new Map<string, BankLineMatch>();
  const taken = new Set<string>();
  lines.forEach((l, i) => {
    if (candidates[i]!.length === 0) result.set(l.key, { kind: 'none' });
    else if (candidates[i]!.length > 1)
      result.set(l.key, { kind: 'ambiguous', bookingIds: candidates[i]!.map((b) => b.id) });
  });
  // Identical lines facing exactly as many candidates pair off in order.
  const groups = new Map<string, number[]>();
  lines.forEach((l, i) => {
    if (candidates[i]!.length < 2) return;
    const id = JSON.stringify([l.accountId, l.currency, l.amountCents, l.date]);
    groups.set(id, [...(groups.get(id) ?? []), i]);
  });
  for (const members of groups.values()) {
    const pool = candidates[members[0]!]!;
    if (members.length !== pool.length) continue;
    members.forEach((lineIndex, n) => {
      result.set(lines[lineIndex]!.key, { kind: 'linked', bookingId: pool[n]!.id });
      taken.add(pool[n]!.id);
    });
  }
  // Unambiguous claims: the nearest line takes the booking, the rest are new.
  const claims = new Map<string, number[]>();
  lines.forEach((_, i) => {
    if (candidates[i]!.length === 1)
      claims.set(candidates[i]![0]!.id, [...(claims.get(candidates[i]![0]!.id) ?? []), i]);
  });
  for (const [bookingId, claimants] of claims) {
    const winner = claimants.reduce((best, i) =>
      gap(lines[i]!, candidates[i]![0]!) < gap(lines[best]!, candidates[best]![0]!) ? i : best,
    );
    for (const i of claimants)
      result.set(
        lines[i]!.key,
        i === winner && !taken.has(bookingId) ? { kind: 'linked', bookingId } : { kind: 'none' },
      );
  }
  return result;
}

export function canLinkTransfer(a: MatchBooking, b: MatchBooking): boolean {
  return (
    a.id !== b.id &&
    a.accountId !== b.accountId &&
    a.currency === b.currency &&
    a.amountCents !== 0 &&
    a.amountCents === -b.amountCents &&
    withinBankWindow(a.date, b.date)
  );
}

/** Closest day first, with a stable tie-break. Suggestions never constitute confirmation. */
export function bankMatches<T extends MatchBooking>(
  candidate: MatchBooking,
  rows: readonly T[],
  transfer = false,
): T[] {
  return rows
    .filter((row) =>
      transfer
        ? canLinkTransfer(candidate, row)
        : row.accountId === candidate.accountId &&
          row.currency === candidate.currency &&
          row.amountCents === candidate.amountCents &&
          withinBankWindow(row.date, candidate.date),
    )
    .sort(
      (a, b) =>
        Math.abs(Date.parse(a.date) - Date.parse(candidate.date)) -
          Math.abs(Date.parse(b.date) - Date.parse(candidate.date)) ||
        a.date.localeCompare(b.date) ||
        a.id.localeCompare(b.id),
    );
}

/** Preserve identical purchases; repeated complete windows have identical occurrence keys. */
export function bankTransactionKeys(rows: readonly BankTransaction[]): string[] {
  const counts = new Map<string, number>();
  const references = new Map<string, number>();
  for (const row of rows)
    if (row.reference) references.set(row.reference, (references.get(row.reference) ?? 0) + 1);
  return rows.map((row) => {
    if (row.reference && references.get(row.reference) === 1)
      return JSON.stringify(['reference', row.reference]);
    const fingerprint = JSON.stringify([row.date, row.amountCents, row.currency, row.memo.trim()]);
    const ordinal = (counts.get(fingerprint) ?? 0) + 1;
    counts.set(fingerprint, ordinal);
    return JSON.stringify(['fallback', fingerprint, ordinal]);
  });
}

/** A successful account watermark narrows polling while retaining late-posting overlap. */
export function bankFetchFrom(fromDate: string, lastSyncAt: string | null): string {
  if (!lastSyncAt) return fromDate;
  const overlap = new Date(Date.parse(lastSyncAt) - 21 * 86_400_000).toISOString().slice(0, 10);
  return overlap > fromDate ? overlap : fromDate;
}

export const consentNeedsAttention = (validUntil: string, now: Date): boolean =>
  Date.parse(validUntil) - now.getTime() <= 14 * 86_400_000;

/** Nightly at 02:30 UTC; durable due timestamps allow catch-up after downtime. */
export function nextBankRun(now: Date): string {
  const next = new Date(now);
  next.setUTCHours(2, 30, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}
