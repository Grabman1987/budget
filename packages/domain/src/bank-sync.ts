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
  reference: string | null;
  date: string;
  amountCents: number;
  currency: string;
  memo: string;
  rawPayee?: string | null;
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
