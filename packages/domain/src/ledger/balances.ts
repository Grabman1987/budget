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
 * The one opening-date rule (C5), shared with the SQL read model: an account exists from its
 * `openingDate` on. Before that day its balance is 0. From that day on it is the opening balance
 * plus every booking dated on or after the opening date (earlier bookings belong to the opening
 * balance, e.g. imported history, and are ignored).
 */
export function balanceOn(
  account: BalanceAccount,
  bookings: ReadonlyArray<BalanceBooking>,
  asOf?: string,
): number {
  if (asOf !== undefined && asOf < account.openingDate) return 0;
  let balance = account.openingBalanceCents;
  for (const b of bookings) {
    assertCents(b.amountCents);
    if (b.accountId !== account.id || b.date < account.openingDate) continue;
    if (asOf !== undefined && b.date > asOf) continue;
    balance += b.amountCents;
  }
  return balance;
}

/**
 * Balance of every account as of `asOf` (all bookings when omitted), by the opening-date rule
 * above. Pure; the caller reads bookings without soft-deleted rows.
 */
export function accountBalances(
  accounts: ReadonlyArray<BalanceAccount>,
  bookings: ReadonlyArray<BalanceBooking>,
  asOf?: string,
): Map<string, number> {
  const byAccount = new Map<string, BalanceBooking[]>(accounts.map((a) => [a.id, []]));
  for (const b of bookings) {
    const list = byAccount.get(b.accountId);
    if (!list) throw new Error(`Booking on unknown account ${b.accountId}`);
    list.push(b);
  }
  return new Map(accounts.map((a) => [a.id, balanceOn(a, byAccount.get(a.id) ?? [], asOf)]));
}

/** Balances at several dates (ascending) in a single pass over the bookings. */
export function balanceSeries(
  accounts: ReadonlyArray<BalanceAccount>,
  bookings: ReadonlyArray<BalanceBooking>,
  dates: ReadonlyArray<string>,
): Array<{ date: string; balances: Map<string, number> }> {
  const sorted = [...bookings].sort((a, b) => a.date.localeCompare(b.date));
  const opening = new Map(accounts.map((a) => [a.id, a.openingDate]));
  const moved = new Map(accounts.map((a) => [a.id, 0]));
  const out: Array<{ date: string; balances: Map<string, number> }> = [];
  let i = 0;
  for (const date of dates) {
    while (i < sorted.length && (sorted[i] as BalanceBooking).date <= date) {
      const b = sorted[i] as BalanceBooking;
      assertCents(b.amountCents);
      const from = opening.get(b.accountId);
      if (from === undefined) throw new Error(`Booking on unknown account ${b.accountId}`);
      if (b.date >= from) moved.set(b.accountId, (moved.get(b.accountId) ?? 0) + b.amountCents);
      i++;
    }
    const balances = new Map(
      accounts.map((a) => [
        a.id,
        date < a.openingDate ? 0 : a.openingBalanceCents + (moved.get(a.id) ?? 0),
      ]),
    );
    out.push({ date, balances });
  }
  return out;
}
