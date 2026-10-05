import {
  addDays,
  assignMatches,
  candidateFits,
  convertCashCents,
  liquidityForecast,
  validFuturePreviewDays,
  type ForecastItem,
} from '@budget/domain';
import { expectedPayment, payee } from '../schema';
import { getEntity } from './entities';
import { listBookings } from './bookings';
import { bookedAmountIn, upcoming } from './expected';
import { fxRateOnOrBefore } from './prices';
import { balanceSeries } from './ledger-queries';
import type { Executor } from './types';

/** Read-only account projection: native cash, no household variable plan or automatic booking. */
export function accountPreview(
  db: Executor,
  accountId: string,
  currency: string,
  asOf: string,
  days: number,
) {
  if (!validFuturePreviewDays(days)) throw new RangeError('Preview covers 0–365 whole days');
  if (days === 0) return { points: [], unavailableCurrencies: [] };
  const to = addDays(asOf, days);
  const rows = listBookings(db, { accountId, to });
  const due = upcoming(db, addDays(asOf, 1), to).filter(
    (o) => o.accountId === accountId && o.status === 'expected' && !o.bookingId,
  );
  // Match unlinked pending captures as well. The real matching worker is never run by a chart read.
  const candidates = rows
    .filter((b) => b.status === 'pending' || b.date > asOf)
    .map((b) => ({ b, splits: b.splits }));
  const matches = assignMatches(
    due.map((o) => ({
      key: o.occurrenceId,
      occurrence: {
        dueDate: o.dueDate,
        amountCents: o.amountCents,
        amountMaxCents: null,
        contactShareCents: o.contactShareCents,
      },
      candidates: candidates
        .filter(({ b, splits }) =>
          candidateFits(o, {
            accountId: b.accountId,
            payeeId: b.payeeId,
            payeeContactId: b.payeeId ? (getEntity(db, payee, b.payeeId)?.contactId ?? null) : null,
            categoryIds: splits.flatMap((s) => (s.categoryId ? [s.categoryId] : [])),
            incomeTypeIds: splits.flatMap((s) => (s.incomeTypeId ? [s.incomeTypeId] : [])),
          }),
        )
        .map(({ b }) => ({ id: b.id, date: b.date, amountCents: bookedAmountIn(b, o.currency) })),
      toleranceCents: getEntity(db, expectedPayment, o.paymentId)!.amountToleranceCents,
      windowDays: getEntity(db, expectedPayment, o.paymentId)!.dateWindowDays,
    })),
    new Set(
      upcoming(db, addDays(asOf, -31), to).flatMap((o) => (o.bookingId ? [o.bookingId] : [])),
    ),
  );
  const unbooked = due.filter((o) => !matches.has(o.occurrenceId));
  const rate = (code: string) =>
    code === 'EUR' ? 1_000_000 : fxRateOnOrBefore(db, code, asOf)?.rateMicro;
  const targetRate = rate(currency);
  const unavailableCurrencies = [
    ...new Set(
      unbooked.flatMap((o) => {
        if (o.currency === currency) return [];
        return [...(!rate(o.currency) ? [o.currency] : []), ...(!targetRate ? [currency] : [])];
      }),
    ),
  ];
  if (unavailableCurrencies.length) return { points: [], unavailableCurrencies };
  const items: ForecastItem[] = [
    ...rows
      .filter((b) => b.date > asOf)
      .map((b) => ({ day: b.date, cents: b.amountCents, kind: 'event' as const })),
    ...unbooked.map((o) => ({
      day: o.dueDate,
      cents:
        o.currency === currency
          ? o.amountCents
          : convertCashCents(o.amountCents, rate(o.currency)!, targetRate!),
      kind: o.amountCents > 0 ? ('income' as const) : ('fixed' as const),
    })),
  ];
  const startCents = balanceSeries(db, accountId, { from: asOf, to: asOf })[0]!.balanceCents;
  const forecast = liquidityForecast({
    startDay: asOf,
    startCents,
    days,
    items,
    variablePerDay: () => 0,
  });
  return {
    points: forecast.days.map((d) => ({ date: d.day, balanceCents: d.balanceCents })),
    unavailableCurrencies,
  };
}
