import {
  addDays,
  cashflowWindow,
  lastDayOfMonth,
  monthOf,
  netWorthWindow,
  sumSeries,
  windowPerformance,
  overviewSavingsRate,
  reconcileWholePicture,
  recordedPrincipal,
  isBookedCreditCost,
  toEurCents,
  fxOn,
  type Period,
} from '@budget/domain';
import { isNull, eq } from 'drizzle-orm';
import { account, category, categoryGroup, payee } from '../schema';
import { cashflowReport } from './cashflow-report';
import { budgetLedger } from './queries';
import {
  cashSeries,
  earliestAccountDate,
  netWorthAsOf,
  netWorthDaily,
  portfolioFlows,
  valuationSeries,
} from './portfolio';
import { withValuationRange } from './valuation-notes';
import { rateTable } from './portfolio';
import { BANK_FEE_GROUP } from './bank-costs-report';
import type { Executor } from './types';

/** Report 5.6: existing cashflow, valuation and portfolio performance figures, reconciled in cents. */
export function wholePicture(db: Executor, today: string, period: Period = '1J') {
  const accounts = db.select().from(account).where(isNull(account.deletedAt)).all();
  const earliest = earliestAccountDate(db);
  const months = earliest ? cashflowWindow(period, today, monthOf(earliest)) : [];
  const from = months.length ? addDays(`${months[0]}-01`, -1) : today;
  const to = months.length
    ? lastDayOfMonth(months.at(-1)!) < today
      ? lastDayOfMonth(months.at(-1)!)
      : today
    : today;
  return withValuationRange(months.length ? `${months[0]}-01` : today, to, () => {
    const cashflow = cashflowReport(db, today, period);
    const cashflowByMonth = new Map(cashflow.months.map((m) => [m.month, m]));
    const startCents = netWorthAsOf(db, from).totalCents;
    const daily = months.length ? netWorthDaily(db, addDays(from, 1), to) : [];
    const chain = netWorthWindow(daily, startCents);
    const investments = accounts.filter((a) => a.role === 'investment').map((a) => a.id);
    const budgetAccounts = accounts.filter((a) => a.onBudget).map((a) => a.id);
    const filter = {
      from,
      to,
      accounts: investments,
      referenceAccounts: investments,
      view: 'depot' as const,
    };
    const valuation = valuationSeries(db, { from, to, accounts: investments });
    const cash = cashSeries(db, valuation.days, investments);
    const value = sumSeries(valuation.totalCents, ...cash.values());
    const input = {
      series: valuation.days.map((date, i) => ({ date, valueCents: value[i]! })),
      flows: portfolioFlows(db, filter),
    };
    const paidIn = portfolioFlows(db, { ...filter, externalAccounts: budgetAccounts });
    const debtIds = new Set(
      accounts.filter((a) => a.type === 'loan' || a.type === 'credit_card').map((a) => a.id),
    );
    const ledger = budgetLedger(db);
    const feeCategories = new Map(
      db
        .select({ id: category.id, kind: category.kind, group: categoryGroup.name })
        .from(category)
        .innerJoin(categoryGroup, eq(category.groupId, categoryGroup.id))
        .all()
        .map((c) => [c.id, c]),
    );
    const systemPayees = new Set(
      db
        .select()
        .from(payee)
        .all()
        .filter((p) => p.systemKind !== null)
        .map((p) => p.id),
    );
    const rates = rateTable(db, to);
    const eurAmount = (s: (typeof ledger.splits)[number]) => {
      const a = accounts.find((a) => a.id === s.accountId)!;
      return a.currency === 'EUR'
        ? s.amountCents
        : toEurCents(s.amountCents, fxOn(rates, a.currency, s.date));
    };
    const netWorthByDay = new Map(daily.map((d) => [d.date, d.netWorthCents]));
    const rows = months.map((month) => {
      const start = addDays(`${month}-01`, -1);
      const end = lastDayOfMonth(month) < to ? lastDayOfMonth(month) : to;
      const f = cashflowByMonth.get(month);
      const incomeCents = f?.incomeCents ?? 0;
      const needCents = f?.needCents ?? 0;
      const wantCents = f?.wantCents ?? 0;
      const savedCents = f?.netCents ?? 0;
      const performance = windowPerformance(input, { from: start, to: end });
      const previousCents = netWorthByDay.get(start) ?? startCents;
      const endCents = netWorthByDay.get(end) ?? previousCents;
      const marketCents = performance.gainCents;
      const { deltaCents, otherCents } = reconcileWholePicture(
        previousCents,
        endCents,
        savedCents,
        marketCents,
      );
      const principalCents = [...debtIds].reduce((sum, id) => {
        const splits = ledger.splits.filter(
          (s) =>
            s.accountId === id &&
            s.date >= `${month}-01` &&
            s.date <= end &&
            s.date >= accounts.find((a) => a.id === id)!.openingDate &&
            !systemPayees.has(s.payeeId ?? ''),
        );
        const paid = splits
          .filter(
            (s) =>
              s.transferAccountId != null &&
              accounts.some((a) => a.id === s.transferAccountId) &&
              !debtIds.has(s.transferAccountId) &&
              s.amountCents > 0,
          )
          .reduce((sum, s) => sum + eurAmount(s), 0);
        const costs = splits
          .filter((s) =>
            isBookedCreditCost({
              creditAccount: true,
              feeCategory: feeCategories.get(s.categoryId ?? '')?.group === BANK_FEE_GROUP,
              categoryKind: feeCategories.get(s.categoryId ?? '')?.kind ?? '',
              transfer: s.transferAccountId != null,
              systemEntry: false,
            }),
          )
          .reduce((sum, s) => sum - eurAmount(s), 0);
        return sum + recordedPrincipal(paid, costs);
      }, 0);
      return {
        month,
        incomeCents,
        capitalCents: f?.capitalCents ?? 0,
        needCents,
        wantCents,
        savedCents,
        savingsRateBp: overviewSavingsRate({
          incomeCents,
          consumptionCents: needCents + wantCents,
        }),
        investmentsInCents: paidIn
          .filter((flow) => flow.date > start && flow.date <= end)
          .reduce((sum, flow) => sum + flow.cents, 0),
        marketCents,
        principalCents,
        startCents: previousCents,
        endCents,
        deltaCents,
        otherCents,
      };
    });
    const sum = (
      key:
        | 'incomeCents'
        | 'capitalCents'
        | 'needCents'
        | 'wantCents'
        | 'savedCents'
        | 'investmentsInCents'
        | 'marketCents'
        | 'principalCents'
        | 'otherCents',
    ) => rows.reduce((total, r) => total + r[key], 0);
    const incomeCents = sum('incomeCents');
    const savedCents = sum('savedCents');
    const totals = {
      month: 'Summe',
      incomeCents,
      capitalCents: sum('capitalCents'),
      needCents: sum('needCents'),
      wantCents: sum('wantCents'),
      savedCents,
      savingsRateBp: overviewSavingsRate({
        incomeCents,
        consumptionCents: incomeCents - savedCents,
      }),
      investmentsInCents: sum('investmentsInCents'),
      marketCents: sum('marketCents'),
      principalCents: sum('principalCents'),
      startCents: chain.startCents,
      endCents: chain.nowCents,
      deltaCents: chain.deltaCents,
      otherCents: sum('otherCents'),
    };
    return {
      period,
      asOf: to,
      today,
      from,
      to,
      rows,
      totals,
      latestFullMonth: rows.filter((r) => lastDayOfMonth(r.month) <= today).at(-1) ?? null,
    };
  });
}
export type WholePicture = ReturnType<typeof wholePicture>;
