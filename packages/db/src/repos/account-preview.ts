import {
  addDays,
  assignMatches,
  candidateFits,
  convertCashCents,
  liquidityForecast,
  liquidityReport,
  horizonDays,
  plannedEventOccurrences,
  validFuturePreviewDays,
  type ForecastItem,
  type LiquidityHorizon,
  type LiquidityLeverId,
} from '@budget/domain';
import { expectedPayment, payee } from '../schema';
import { getEntity } from './entities';
import { listBookings } from './bookings';
import { bookedAmountIn, upcoming } from './expected';
import { fxRateOnOrBefore } from './prices';
import { balanceSeries } from './ledger-queries';
import type { Executor } from './types';
import { forecastInputs, loadFacts, scheduled } from './rule-inputs';
import { CategoryRuleError } from './errors';

/** Read-only account projection: native cash, no household variable plan or automatic booking. */
export function accountPreview(
  db: Executor,
  accountId: string,
  currency: string,
  asOf: string,
  days: number,
  options?: { horizon: LiquidityHorizon; levers: ReadonlyArray<LiquidityLeverId> },
) {
  if (options) days = horizonDays(options.horizon, asOf);
  if (!options && !validFuturePreviewDays(days))
    throw new RangeError('Preview covers 0–365 whole days');
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
  const facts = options ? loadFacts(db, asOf) : undefined;
  if (
    facts &&
    !facts.accounts.some(
      (a) =>
        a.id === accountId &&
        a.currency === 'EUR' &&
        a.onBudget &&
        a.role === 'budget' &&
        a.openingDate <= asOf,
    )
  )
    throw new CategoryRuleError('Der Liquiditätshorizont ist für EUR-Budget-Konten verfügbar.');
  const sharedDue = facts
    ? scheduled(facts, addDays(asOf, 1), to, asOf, { applyIncomePauses: true })
    : [];
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
      cents: facts
        ? (sharedDue.find((row) => row.payment.id === o.paymentId && row.dueDate === o.dueDate)
            ?.cents ?? 0)
        : o.currency === currency
          ? o.amountCents
          : convertCashCents(o.amountCents, rate(o.currency)!, targetRate!),
      kind: o.amountCents > 0 ? ('income' as const) : ('fixed' as const),
      ...(facts?.categories.find((c) => c.id === o.categoryId)?.class
        ? { group: facts.categories.find((c) => c.id === o.categoryId)!.class! }
        : {}),
    })),
  ];
  const startCents = balanceSeries(db, accountId, { from: asOf, to: asOf })[0]!.balanceCents;
  if (facts && options) {
    const events = facts.plannedEvents
      .filter((e) => e.enabled && e.accountId === accountId)
      .flatMap((e) => plannedEventOccurrences(e, addDays(asOf, 1), to))
      .map((e) => ({ day: e.date, cents: e.amountCents, kind: 'event' as const, label: e.name }));
    const report = liquidityReport({
      startDay: asOf,
      startCents,
      items,
      events,
      variableMonthlyCents: 0,
      horizon: options.horizon,
      levers: options.levers,
    });
    const variableMonthlyCents = forecastInputs(facts, asOf, {
      byAccount: {},
    }).variableMonthlyCents;
    const unassignedEventCount = facts.plannedEvents.filter(
      (e) =>
        e.enabled &&
        e.accountId === null &&
        plannedEventOccurrences(e, addDays(asOf, 1), to).length > 0,
    ).length;
    const unassignedPaymentCount = new Set(
      sharedDue.filter((row) => row.payment.accountId === null).map((row) => row.payment.id),
    ).size;
    return {
      points: report.points.map((p) => ({ date: p.day, balanceCents: p.balanceCents })),
      unavailableCurrencies,
      previewCoverage: {
        partial: variableMonthlyCents > 0 || unassignedEventCount > 0 || unassignedPaymentCount > 0,
        variableMonthlyCents,
        unassignedEventCount,
        unassignedPaymentCount,
        endDay: to,
        horizon: options.horizon,
      },
    };
  }
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
