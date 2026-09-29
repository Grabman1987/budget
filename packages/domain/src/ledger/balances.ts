export interface BalanceAccount {
  id: string;
  openingBalanceCents: number;
  /** Bookings before this date are not part of the account (they belong to the opening balance). */
  openingDate: string;
}

export interface BalanceBooking {
  accountId: string;
  date: string;
  /** Signed, in cents. */
  amountCents: number;
}

function assertCents(value: number): void {
  if (!Number.isSafeInteger(value))
    throw new RangeError(`Amounts are integer cents, got ${String(value)}`);
}

/**
 * Account balances from bookings: opening balance plus every booking on or after the opening date
 * up to and including `asOf` (all bookings when omitted). Pure; the caller reads bookings without
 * soft-deleted rows.
 */
export function accountBalances(
  accounts: ReadonlyArray<BalanceAccount>,
  bookings: ReadonlyArray<BalanceBooking>,
  asOf?: string,
): Map<string, number> {
  const balances = new Map(accounts.map((a) => [a.id, a.openingBalanceCents]));
  const opening = new Map(accounts.map((a) => [a.id, a.openingDate]));
  for (const b of bookings) {
    assertCents(b.amountCents);
    const from = opening.get(b.accountId);
    if (from === undefined) throw new Error(`Booking on unknown account ${b.accountId}`);
    if (b.date < from || (asOf !== undefined && b.date > asOf)) continue;
    balances.set(b.accountId, (balances.get(b.accountId) ?? 0) + b.amountCents);
  }
  return balances;
}

/** Balances at several dates (ascending) in a single pass over the bookings. */
export function balanceSeries(
  accounts: ReadonlyArray<BalanceAccount>,
  bookings: ReadonlyArray<BalanceBooking>,
  dates: ReadonlyArray<string>,
): Array<{ date: string; balances: Map<string, number> }> {
  const sorted = [...bookings].sort((a, b) => a.date.localeCompare(b.date));
  const opening = new Map(accounts.map((a) => [a.id, a.openingDate]));
  const running = new Map(accounts.map((a) => [a.id, a.openingBalanceCents]));
  const out: Array<{ date: string; balances: Map<string, number> }> = [];
  let i = 0;
  for (const date of dates) {
    while (i < sorted.length && (sorted[i] as BalanceBooking).date <= date) {
      const b = sorted[i] as BalanceBooking;
      assertCents(b.amountCents);
      const from = opening.get(b.accountId);
      if (from === undefined) throw new Error(`Booking on unknown account ${b.accountId}`);
      if (b.date >= from) running.set(b.accountId, (running.get(b.accountId) ?? 0) + b.amountCents);
      i++;
    }
    out.push({ date, balances: new Map(running) });
  }
  return out;
}
