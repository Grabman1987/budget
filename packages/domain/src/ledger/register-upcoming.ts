interface Movement {
  id: string;
  accountId: string | null;
  date: string;
  amountCents: number;
  currency: string;
}
interface ScheduledMovement extends Movement {
  paymentId: string;
  bookingId: string | null;
  status: string;
}

/** Native account projections; an unconvertible schedule makes subsequent balances unknown. */
export function projectUpcomingRegister(
  bookings: readonly Movement[],
  schedules: readonly ScheduledMovement[],
  accounts: readonly { id: string; balanceCents: number; currency: string }[],
  today: string,
): { id: string; kind: 'booking' | 'schedule'; date: string; balanceAfterCents: number | null }[] {
  const seen = new Set<string>();
  const next = [...schedules]
    .filter((s) => s.date >= today && s.status === 'expected' && !s.bookingId && s.accountId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .filter((s) => {
      if (seen.has(s.paymentId)) return false;
      seen.add(s.paymentId);
      return true;
    });
  const rows = [
    ...bookings.filter((b) => b.date > today).map((b) => ({ ...b, kind: 'booking' as const })),
    ...next.map((s) => ({ ...s, kind: 'schedule' as const })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const balances = new Map(accounts.map((a) => [a.id, a.balanceCents as number | null]));
  const currencies = new Map(accounts.map((a) => [a.id, a.currency]));
  return rows.map((r) => {
    if (!Number.isSafeInteger(r.amountCents)) throw new RangeError('Amounts must be integer cents');
    const before = r.accountId ? balances.get(r.accountId) : null;
    const balanceAfterCents =
      before == null || currencies.get(r.accountId!) !== r.currency ? null : before + r.amountCents;
    if (r.accountId) balances.set(r.accountId, balanceAfterCents);
    return { id: r.id, kind: r.kind, date: r.date, balanceAfterCents };
  });
}
