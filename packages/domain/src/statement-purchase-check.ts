/** Signed account-currency cents: purchases negative, refunds positive. EUR amounts on
 * foreign-currency statement rows are already converted by the issuer, never by this check. */
export type StatementPurchaseLine = {
  id: string;
  date: string | null;
  description: string;
  amountCents: number;
};
export type StatementPurchaseBooking = StatementPurchaseLine & {
  date: string;
};
export type StatementPurchaseInput = {
  period: { from: string; to: string } | null;
  printedTotalCents: number | null;
  /** null means unavailable/incomplete extraction; [] means a known empty list. */
  lines: readonly StatementPurchaseLine[] | null;
  linesComplete?: boolean;
};
export type StatementPurchaseCheck = {
  period: StatementPurchaseInput['period'];
  printedTotalCents: number | null;
  bookedPurchaseCents: number | null;
  differenceCents: number | null;
  sumMatches: boolean | null;
  linesAvailable: boolean;
  matched: { line: StatementPurchaseLine; booking: StatementPurchaseBooking }[];
  statementOnly: { line: StatementPurchaseLine; ambiguous: boolean }[];
  bookingOnly: StatementPurchaseBooking[];
  amountDifferences: {
    line: StatementPurchaseLine;
    booking: StatementPurchaseBooking;
    differenceCents: number;
  }[];
};
const normalized = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-AT');
const checked = (n: number) => {
  if (!Number.isSafeInteger(n)) throw new Error('Unsafe integer cents');
  return n;
};
const number = (n: bigint) => checked(Number(n));

/** Read-only, deterministic and deliberately conservative: matching requires a unique
 * edge in both directions. Equal-day/equal-amount candidates are never disambiguated by name. */
export function checkStatementPurchases(
  statement: StatementPurchaseInput,
  bookings: readonly StatementPurchaseBooking[],
): StatementPurchaseCheck {
  if (statement.period && statement.period.from > statement.period.to)
    throw new Error('Invalid statement period');
  if (statement.printedTotalCents !== null) checked(statement.printedTotalCents);
  const lines = [...(statement.lines ?? [])];
  const cycle = statement.period
    ? bookings.filter((b) => b.date >= statement.period!.from && b.date <= statement.period!.to)
    : [];
  for (const rows of [lines, cycle]) {
    if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new Error('Duplicate identity');
    rows.forEach((r) => checked(r.amountCents));
  }
  const sum = statement.period
    ? number(cycle.reduce((n, b) => n - BigInt(b.amountCents), 0n))
    : null;
  const difference =
    sum !== null && statement.printedTotalCents !== null
      ? number(BigInt(sum) - BigInt(statement.printedTotalCents))
      : null;
  const result: StatementPurchaseCheck = {
    period: statement.period,
    printedTotalCents: statement.printedTotalCents,
    bookedPurchaseCents: sum,
    differenceCents: difference,
    sumMatches: difference === null ? null : difference === 0,
    linesAvailable: statement.lines !== null && statement.linesComplete !== false,
    matched: [],
    statementOnly: [],
    bookingOnly: [],
    amountDifferences: [],
  };
  // No cycle means no scoped booking population: absence is unknown, never missing.
  if (!statement.period) return result;
  const exact = (l: StatementPurchaseLine, b: StatementPurchaseBooking) =>
    l.date === b.date && l.amountCents === b.amountCents;
  const usedLines = new Set<string>(),
    usedBookings = new Set<string>();
  for (const line of lines) {
    const candidates = cycle.filter((b) => exact(line, b));
    if (candidates.length !== 1) continue;
    const booking = candidates[0]!;
    if (lines.filter((l) => exact(l, booking)).length !== 1) continue;
    result.matched.push({ line, booking });
    usedLines.add(line.id);
    usedBookings.add(booking.id);
  }
  const remaining = lines.filter((l) => !usedLines.has(l.id));
  const available = cycle.filter((b) => !usedBookings.has(b.id));
  const plausible = (l: StatementPurchaseLine, b: StatementPurchaseBooking) =>
    l.date === b.date &&
    normalized(l.description) !== '' &&
    normalized(l.description) === normalized(b.description);
  for (const line of remaining) {
    if (!line.date || line.date < statement.period.from || line.date > statement.period.to) {
      result.statementOnly.push({ line, ambiguous: true });
      continue;
    }
    const exactCandidates = cycle.filter((b) => exact(line, b));
    const candidates = available.filter((b) => plausible(line, b));
    const booking = candidates[0];
    if (
      !exactCandidates.length &&
      candidates.length === 1 &&
      booking &&
      !lines.some((l) => exact(l, booking)) &&
      remaining.filter((l) => plausible(l, booking)).length === 1
    ) {
      result.amountDifferences.push({
        line,
        booking,
        differenceCents: number(BigInt(booking.amountCents) - BigInt(line.amountCents)),
      });
      usedBookings.add(booking.id);
    } else
      result.statementOnly.push({
        line,
        ambiguous: exactCandidates.length > 0 || candidates.length > 0,
      });
  }
  result.bookingOnly = cycle.filter((b) => !usedBookings.has(b.id));
  return result;
}
