import { mulDivRound } from '../wealth/int';

export interface PayeeAnalysisBooking {
  id: string;
  date: string;
  payeeId: string | null;
  spendCents: number;
  categories: ReadonlyArray<{ id: string; name: string; spendCents: number }>;
}

export interface PayeeAnalysisCategory {
  id: string;
  name: string;
  amountCents: number;
}

export interface PayeeAnalysisRow {
  payeeId: string | null;
  name: string;
  amountCents: number;
  bookingCount: number;
  averageSpendCents: number;
  sharePercent: number | null;
  previousAmountCents: number | null;
  changeCents: number | null;
  categories: PayeeAnalysisCategory[];
}

export interface PayeeAnalysisPeriod {
  totalSpendCents: number;
  bookingCount: number;
  averageSpendCents: number | null;
  rows: PayeeAnalysisRow[];
}

function addExact(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b))
    throw new RangeError('Payee report source is outside safe integer cents');
  const result = a + b;
  if (!Number.isSafeInteger(result))
    throw new RangeError('Payee report exceeds safe integer cents');
  return result;
}

/** Aggregate signed eligible activity from the read model, preserving refunds and null payees. */
export function aggregatePayeeAnalysis(
  bookings: ReadonlyArray<PayeeAnalysisBooking>,
  names: ReadonlyMap<string, string>,
  range: { from: string; to: string },
): PayeeAnalysisPeriod {
  const byPayee = new Map<
    string,
    { amount: number; count: number; categories: Map<string, { name: string; amount: number }> }
  >();
  const relevant = bookings.filter(
    (booking) => booking.date >= range.from && booking.date <= range.to,
  );
  for (const booking of relevant) {
    const key = booking.payeeId ?? '';
    const row = byPayee.get(key) ?? { amount: 0, count: 0, categories: new Map() };
    row.amount = addExact(row.amount, booking.spendCents);
    row.count += 1;
    for (const category of booking.categories) {
      const current = row.categories.get(category.id) ?? { name: category.name, amount: 0 };
      current.amount = addExact(current.amount, category.spendCents);
      row.categories.set(category.id, current);
    }
    byPayee.set(key, row);
  }
  let totalSpendCents = 0;
  for (const row of byPayee.values()) totalSpendCents = addExact(totalSpendCents, row.amount);
  const rows = [...byPayee]
    .map(([key, value]) => ({
      payeeId: key || null,
      name: key ? (names.get(key) ?? 'Gelöschter Empfänger') : 'Ohne Empfänger',
      amountCents: value.amount,
      bookingCount: value.count,
      averageSpendCents: mulDivRound(value.amount, 1, value.count),
      sharePercent: totalSpendCents > 0 ? (value.amount / totalSpendCents) * 100 : null,
      previousAmountCents: null,
      changeCents: null,
      categories: [...value.categories]
        .map(([id, category]) => ({
          id,
          name: category.name,
          amountCents: category.amount,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    }))
    .sort((a, b) => b.amountCents - a.amountCents || a.name.localeCompare(b.name, 'de'));
  return {
    totalSpendCents,
    bookingCount: relevant.length,
    averageSpendCents: relevant.length ? mulDivRound(totalSpendCents, 1, relevant.length) : null,
    rows,
  };
}

/** Attach an equal-length previous period when its full source window is available. */
export function comparePayeeAnalysis(
  current: PayeeAnalysisPeriod,
  previous: PayeeAnalysisPeriod | null,
): PayeeAnalysisPeriod {
  if (!previous) return current;
  const previousAmounts = new Map(previous.rows.map((row) => [row.payeeId ?? '', row.amountCents]));
  return {
    ...current,
    rows: current.rows.map((row) => {
      const previousAmountCents = previousAmounts.get(row.payeeId ?? '') ?? 0;
      return {
        ...row,
        previousAmountCents,
        changeCents: addExact(row.amountCents, -previousAmountCents),
      };
    }),
  };
}

/** The prototype's leading five recipient figures, with exact signed remainder and guarded share. */
export function payeeAnalysisTopFive(period: PayeeAnalysisPeriod) {
  const topFiveCents = period.rows
    .slice(0, 5)
    .reduce((sum, row) => addExact(sum, row.amountCents), 0);
  return {
    topFiveCents,
    remainingCents: addExact(period.totalSpendCents, -topFiveCents),
    topFiveSharePercent:
      period.totalSpendCents > 0 ? (topFiveCents / period.totalSpendCents) * 100 : null,
  };
}
