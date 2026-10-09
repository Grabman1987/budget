import {
  averageRateMicro,
  contractBinding,
  contractSeries,
  contractPrices,
  contractsOverview,
  fixedCostRatio,
  lastDayOfMonth,
  monthOf,
  type ContractMarker,
  type ContractSeriesPoint,
  type ContractSource,
  type ContractsOverview,
  type FxLookup,
} from '@budget/domain';
import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import {
  booking,
  bookingSplit,
  category,
  categoryGroup,
  expectedPayment,
  expectedPaymentVersion,
  rule,
} from '../schema';
import { fxRateOnOrBefore } from './prices';
import { allocationMonth } from './allocation';
import { referenceMonth } from './rule-inputs';
import { reportMonths } from './spending-report';
import { matchedCharges } from './contract-history';
import type { Executor } from './types';

/**
 * Verträge und Abos (2.3): the outflow contracts of the expected payments (fixed costs, minimum
 * loan payments, periodic costs), valued like rule R10. Foreign-currency contracts keep their
 * original amount and are converted at the latest stored reference rate; payments made in that
 * currency show the real EUR paid, the average rate and the stored bank fee.
 */

export interface ForeignContractRow {
  id: string;
  name: string;
  currency: string;
  nativeCents: number;
  eurCents: number | null;
  rateMicro: number | null;
  /** Payments of the last twelve full months in this contract's category and currency. */
  paidEurCents: number;
  paidNativeCents: number;
  paymentCount: number;
  /** EUR per unit of the foreign currency, micro-units; `null` without payments. */
  averageRateMicro: number | null;
  feeCents: number;
  /** Payments with more than one split are not attributed to a contract. */
  skippedSplitPayments: number;
}

export interface ContractsReport extends ContractsOverview {
  series: ContractSeriesPoint[];
  markers: ContractMarker[];
  seriesPartial: boolean;
  derivedContracts: string[];
  foreign: ForeignContractRow[];
  foreignFrom: string | null;
  foreignTo: string | null;
  /** The shared R10 figures the bound amount is the numerator of; `null` without an income base. */
  r10: {
    ratioBp: number | null;
    maxBp: number;
    netIncomeMonthlyCents: number | null;
    fixedMonthlyCents: number;
    periodicAnnualCents: number;
  } | null;
}

export function contractSources(db: Executor): ContractSource[] {
  const groups = new Map(
    db
      .select()
      .from(categoryGroup)
      .where(isNull(categoryGroup.deletedAt))
      .all()
      .map((g) => [g.id, g.name]),
  );
  const cats = db
    .select()
    .from(category)
    .where(isNull(category.deletedAt))
    .orderBy(asc(category.sortOrder), asc(category.name), asc(category.id))
    .all();
  const order = new Map(cats.map((c, i) => [c.id, i]));
  const byCategory = new Map(cats.map((c) => [c.id, c]));
  const versions = db
    .select()
    .from(expectedPaymentVersion)
    .where(isNull(expectedPaymentVersion.deletedAt))
    .all();
  return db
    .select()
    .from(expectedPayment)
    .where(and(isNull(expectedPayment.deletedAt), eq(expectedPayment.kind, 'outflow')))
    .all()
    .map((p): ContractSource => {
      const c = p.categoryId ? byCategory.get(p.categoryId) : undefined;
      return {
        id: p.id,
        name: p.name,
        groupName: c ? (groups.get(c.groupId) ?? 'Ohne Gruppe') : 'Ohne Kategorie',
        categoryId: p.categoryId,
        payeeId: p.payeeId,
        categoryName: c?.name ?? null,
        class: c?.class ?? null,
        categoryKind: c?.kind ?? null,
        categoryStage: c?.stage ?? null,
        rhythm: p.rhythm,
        intervalWeeks: p.intervalWeeks,
        dueDay: p.dueDay,
        dueMonth: p.dueMonth,
        dateShift: p.dateShift,
        startDate: p.startDate,
        endDate: p.endDate,
        versions: versions
          .filter((v) => v.expectedPaymentId === p.id)
          .map((v) => ({
            validFrom: v.validFrom,
            amountCents: v.amountCents,
            currency: v.currency,
          })),
      };
    })
    .sort(
      (a, b) =>
        (order.get(a.categoryId ?? '') ?? 1e9) - (order.get(b.categoryId ?? '') ?? 1e9) ||
        a.name.localeCompare(b.name, 'de'),
    );
}

export function contractsReport(db: Executor, today: string): ContractsReport {
  const derivedContracts: string[] = [];
  const sources = contractSources(db)
    .filter((s) => contractBinding(s) !== null)
    .map((s) => {
      const history = contractPrices(
        s.versions,
        matchedCharges(db, s.id, s.versions[0]?.currency ?? 'EUR').filter((c) => c.date <= today),
      );
      if (history.source === 'bookings') derivedContracts.push(s.id);
      return {
        ...s,
        currentVersions: s.versions,
        versions: history.versions,
        startDate:
          history.source === 'bookings'
            ? (history.versions[0]?.validFrom ?? s.startDate)
            : s.startDate,
      };
    });
  const cache = new Map<string, number | null>();
  const fx: FxLookup = (currency, day) => {
    const key = `${currency}|${day}`;
    if (!cache.has(key)) cache.set(key, fxRateOnOrBefore(db, currency, day)?.rateMicro ?? null);
    return cache.get(key) ?? null;
  };
  const overview = contractsOverview(today, sources, fx);
  const { first, through, available } = reportMonths(db, today);
  const earliest = sources.flatMap((s) => s.versions.map((v) => monthOf(v.validFrom))).sort()[0];
  const from = [first, earliest]
    .filter((m): m is string => m !== null && m !== undefined)
    .sort()[0];
  const series =
    from && from <= through
      ? contractSeries(sources, from, through, fx)
      : { points: [], markers: [], partial: false };

  // Payments in a foreign currency, last twelve full months.
  const window = available.slice(-12);
  const foreignFrom = window[0] ? `${window[0]}-01` : null;
  const foreignTo = window.length ? lastDayOfMonth(window[window.length - 1] as string) : null;
  const foreign: ForeignContractRow[] = overview.items
    .filter((i) => i.currency !== 'EUR')
    .map((i) => {
      let paidEur = 0;
      let paidNative = 0;
      let fee = 0;
      let count = 0;
      let skipped = 0;
      if (i.categoryId && foreignFrom && foreignTo) {
        const rows = db
          .select({
            id: booking.id,
            amountCents: booking.amountCents,
            originalCents: booking.originalAmountCents,
            fee: booking.fxFeeCents,
            splitCategory: bookingSplit.categoryId,
          })
          .from(booking)
          .innerJoin(bookingSplit, eq(bookingSplit.bookingId, booking.id))
          .where(
            and(
              isNull(booking.deletedAt),
              eq(booking.originalCurrency, i.currency),
              gte(booking.date, foreignFrom),
              lte(booking.date, foreignTo),
            ),
          )
          .all();
        const byBooking = new Map<string, typeof rows>();
        for (const r of rows) byBooking.set(r.id, [...(byBooking.get(r.id) ?? []), r]);
        for (const splits of byBooking.values()) {
          if (!splits.some((s) => s.splitCategory === i.categoryId)) continue;
          if (splits.length > 1 || splits[0]?.originalCents === null) {
            skipped += 1;
            continue;
          }
          const r = splits[0] as (typeof rows)[number];
          if (r.amountCents >= 0 || (r.originalCents ?? 0) >= 0) continue;
          paidEur += Math.abs(r.amountCents);
          paidNative += Math.abs(r.originalCents as number);
          fee += Math.abs(r.fee ?? 0);
          count += 1;
        }
      }
      return {
        id: i.id,
        name: i.name,
        currency: i.currency,
        nativeCents: i.nativeCents,
        eurCents: i.eurCents,
        rateMicro: i.rateMicro,
        paidEurCents: paidEur,
        paidNativeCents: paidNative,
        paymentCount: count,
        averageRateMicro: averageRateMicro(paidEur, paidNative),
        feeCents: fee,
        skippedSplitPayments: skipped,
      };
    });

  // The shared R10 figures: the same fixed and periodic selection (checked against `ruleInputs` in
  // the tests) over the same income base, the net income of the last full month.
  const refMonth = referenceMonth(today);
  const incomeMonth = allocationMonth(db, refMonth);
  const netIncomeMonthlyCents = first
    ? incomeMonth.incomeCents + Math.round(incomeMonth.annualIncomeCents / 12)
    : null;
  const r10Row = db.select().from(rule).where(eq(rule.code, 'R10')).get();
  const maxBp = (JSON.parse(r10Row?.paramsJson ?? '{}') as { maxBp?: number }).maxBp ?? 5_500;
  const r10 =
    netIncomeMonthlyCents !== null && overview.items.length > 0
      ? {
          ratioBp: fixedCostRatio({
            fixedMonthlyCents: overview.fixedMonthlyCents,
            periodicAnnualCents: overview.periodicAnnualCents,
            netIncomeCents: netIncomeMonthlyCents,
          }),
          maxBp,
          netIncomeMonthlyCents,
          fixedMonthlyCents: overview.fixedMonthlyCents,
          periodicAnnualCents: overview.periodicAnnualCents,
        }
      : null;

  return {
    ...overview,
    series: series.points,
    markers: series.markers,
    seriesPartial: series.partial,
    derivedContracts,
    foreign,
    foreignFrom,
    foreignTo,
    r10,
  };
}
