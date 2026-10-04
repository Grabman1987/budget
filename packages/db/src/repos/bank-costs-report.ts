import {
  addMonths,
  contractBinding,
  contractsOverview,
  costsOverview,
  isBookedCreditCost,
  ExchangeRateUnavailableError,
  PriceUnavailableError,
  lastDayOfMonth,
  monthHouseholdIncome,
  monthOf,
  payoffPlan,
  PaymentBelowInterestError,
  type CostPart,
  type CostsOverview,
  type PayoffPlan,
} from '@budget/domain';
import { and, eq, gte, isNull } from 'drizzle-orm';
import {
  account,
  booking,
  bookingSplit,
  INCOME_TYPES,
  trade,
  category,
  categoryGroup,
  payee,
} from '../schema';
import { MissingFxRateError } from './errors';
import { contractSources } from './contracts-report';
import { portfolioSummary } from './portfolio-summary';
import { accountSummaries } from './ledger-queries';
import { fxRateOnOrBefore } from './prices';
import { reportTables } from './report-tables';
import { reportMonths, spendCategories, tableSpendByMonth } from './spending-report';
import type { Executor } from './types';

/**
 * Bank- und Zinskosten (2.6). Booked costs only: loan interest/fees (splits explicitly attributed to the fee group on loan accounts,
 * never transfers), bank fees (the category group "Bank und Gebühren"), broker fees of trades and
 * the bank's foreign-currency fee of bookings. Fund costs (TER) are never booked and stay out of
 * the sums. Earnings are interest and dividends booked on budget accounts, labelled and apart:
 * they are not household income (owner decision 02.10.2026).
 */

/** Name of the category group whose spending counts as bank fees. */
export const BANK_FEE_GROUP = 'Bank und Gebühren';

export interface CreditLineRow {
  id: string;
  name: string;
  institutionId: string | null;
  type: string;
  /** Credit limit (card, loan frame) or overdraft limit; `null` without one. */
  limitCents: number | null;
  /** Amount in use: debt of a loan, negative balance of a card or overdraft. */
  usedCents: number;
  rateBp: number | null;
  /** Loan terms from Einstellungen › Konten: fixed or variable interest, installment, term start. */
  interestKind: 'fixed' | 'variable' | null;
  installmentCents: number | null;
  termStart: string | null;
  originalAmountCents: number | null;
  termEnd: string | null;
  /** Interest booked in the last twelve full months; `null` where the ledger has no interest bookings. */
  interest12Cents: number | null;
  currency: string;
}

export interface LoanScenario {
  accountId: string;
  name: string;
  rateBp: number;
  balanceCents: number;
  /** Regular payment per month and the extra repayment currently planned per month. */
  paymentCents: number;
  /** Where `paymentCents` comes from: the loan's terms (Konten) or the expected payments. */
  paymentSource: 'terms' | 'contracts';
  interestKind: 'fixed' | 'variable' | null;
  extraCents: number;
  plan: PayoffPlan | null;
  /** The payment does not cover the interest: nothing to project. */
  belowInterest: boolean;
}

export interface BankCostsReport extends CostsOverview {
  from: string | null;
  to: string | null;
  partLabels: Record<string, string>;
  creditLines: CreditLineRow[];
  loan: LoanScenario | null;
  /** Number of loans with a rate; the scenario needs exactly one. */
  loanCount: number;
  /** Fremdwährung: bookings with a bank fee in the window, to explain the part. */
  foreignFeeBookings: number;
  /** Trades of an account in another currency are not converted and not counted. */
  skippedForeignTrades: number;
}

const monthKey = (day: string) => day.slice(0, 7);
const add = (map: Record<string, number>, month: string, cents: number) => {
  map[month] = (map[month] ?? 0) + cents;
};

export function bankCostsReport(db: Executor, today: string): BankCostsReport {
  const { available } = reportMonths(db, today);
  const inWindow = new Set(available);
  const last12 = new Set(available.slice(-12));
  const first = available[0];
  const last = available[available.length - 1];
  const tables = reportTables(db, { today });
  const accounts = db.select().from(account).where(isNull(account.deletedAt)).all();
  const loanIds = new Set(accounts.filter((a) => a.type === 'loan').map((a) => a.id));
  const onBudget = new Set(accounts.filter((a) => a.onBudget).map((a) => a.id));
  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));

  // Loan costs require explicit fee-category attribution; debt movements are not costs.
  const feeCategories = spendCategories(db).filter((c) => c.groupName === BANK_FEE_GROUP);
  const interest: Record<string, number> = {};
  const interestByAccount = new Map<string, Record<string, number>>();
  // Foreign-currency fees of the bank.
  const fx: Record<string, number> = {};
  let foreignFeeBookings = 0;
  const earnings: Record<string, number> = {};
  const rows = db
    .select({
      accountId: booking.accountId,
      date: booking.date,
      amountCents: booking.amountCents,
      id: booking.id,
      openingDate: account.openingDate,
      systemKind: payee.systemKind,
      transferId: booking.transferId,
      fee: booking.fxFeeCents,
    })
    .from(booking)
    .innerJoin(account, eq(account.id, booking.accountId))
    .leftJoin(payee, eq(payee.id, booking.payeeId))
    .where(and(isNull(booking.deletedAt), isNull(account.deletedAt)))
    .all();
  for (const r of rows) {
    const month = monthKey(r.date);
    if (
      !inWindow.has(month) ||
      r.date < r.openingDate ||
      r.systemKind !== null ||
      r.transferId !== null
    )
      continue;
    if (r.fee !== null && r.fee !== 0) {
      add(fx, month, Math.abs(r.fee));
      if (last12.has(month)) foreignFeeBookings += 1;
    }
  }
  const costSplits = db
    .select({
      accountId: booking.accountId,
      date: booking.date,
      cents: bookingSplit.amountCents,
      openingDate: account.openingDate,
      transferId: booking.transferId,
      splitTransferId: bookingSplit.transferId,
      systemKind: payee.systemKind,
      kind: category.kind,
      groupName: categoryGroup.name,
    })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .innerJoin(account, eq(account.id, booking.accountId))
    .innerJoin(category, eq(category.id, bookingSplit.categoryId))
    .innerJoin(categoryGroup, eq(categoryGroup.id, category.groupId))
    .leftJoin(payee, eq(payee.id, booking.payeeId))
    .where(
      and(
        isNull(booking.deletedAt),
        isNull(account.deletedAt),
        isNull(category.deletedAt),
        isNull(categoryGroup.deletedAt),
      ),
    )
    .all();
  for (const r of costSplits) {
    const month = monthKey(r.date);
    if (
      !inWindow.has(month) ||
      r.date < r.openingDate ||
      !isBookedCreditCost({
        creditAccount: loanIds.has(r.accountId),
        feeCategory: r.groupName === BANK_FEE_GROUP,
        categoryKind: r.kind,
        transfer: r.transferId !== null || r.splitTransferId !== null,
        systemEntry: r.systemKind !== null,
      })
    )
      continue;
    add(interest, month, -r.cents);
    const own = interestByAccount.get(r.accountId) ?? {};
    add(own, month, -r.cents);
    interestByAccount.set(r.accountId, own);
  }
  // Earnings: interest and dividends on budget accounts (income type Kapitalerträge).
  const incomeRows = db
    .select({
      accountId: booking.accountId,
      date: booking.date,
      cents: bookingSplit.amountCents,
      type: bookingSplit.incomeTypeId,
      transferId: booking.transferId,
      splitTransferId: bookingSplit.transferId,
    })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .where(and(isNull(booking.deletedAt), eq(bookingSplit.incomeTypeId, INCOME_TYPES.capital.id)))
    .all();
  for (const r of incomeRows) {
    const month = monthKey(r.date);
    if (!inWindow.has(month) || !onBudget.has(r.accountId)) continue;
    if (r.transferId !== null || r.splitTransferId !== null || r.cents <= 0) continue;
    add(earnings, month, r.cents);
  }

  // Bank fees: net spending of the fee group (the same envelope activity as everywhere).
  const fees: Record<string, number> = {};
  if (feeCategories.length > 0 && available.length > 0) {
    const spend = tableSpendByMonth(tables, feeCategories);
    for (const [month, byCategory] of Object.entries(spend))
      for (const cents of Object.values(byCategory)) add(fees, month, cents);
  }

  // Loan accounts can also be on budget: their explicit cost splits were already counted above.
  for (const r of costSplits) {
    const month = monthKey(r.date);
    if (
      onBudget.has(r.accountId) &&
      inWindow.has(month) &&
      r.date >= r.openingDate &&
      isBookedCreditCost({
        creditAccount: loanIds.has(r.accountId),
        feeCategory: r.groupName === BANK_FEE_GROUP,
        categoryKind: r.kind,
        transfer: r.transferId !== null || r.splitTransferId !== null,
        systemEntry: r.systemKind !== null,
      })
    )
      add(fees, month, r.cents);
  }

  // Broker fees of trades (the trade's fee, and standalone fee entries); EUR accounts only.
  const orders: Record<string, number> = {};
  let skippedForeignTrades = 0;
  const tradeRows = db
    .select({
      accountId: trade.accountId,
      date: trade.date,
      kind: trade.kind,
      fee: trade.feeCents,
      amount: trade.amountCents,
    })
    .from(trade)
    .where(and(isNull(trade.deletedAt), gte(trade.date, `${first ?? '9999-12'}-01`)))
    .all();
  for (const t of tradeRows) {
    const month = monthKey(t.date);
    if (!inWindow.has(month)) continue;
    const cents = t.fee + (t.kind === 'fee' ? t.amount : 0);
    if (cents === 0) continue;
    if (currencyOf.get(t.accountId) !== 'EUR') {
      skippedForeignTrades += 1;
      continue;
    }
    add(orders, month, cents);
  }

  // Household income of the window: the monthly table read model (no Kapitalerträge, no
  // Erstattungen, transfers and contact repayments never count).
  const window12 = available.slice(-12);
  const meta = { categories: tables.categories, incomeTypes: tables.incomeTypes };
  const incomeByMonth = new Map(
    tables.months.map((m) => [m.month, monthHouseholdIncome(m, meta)] as const),
  );
  const incomeCents = window12.reduce((a, m) => a + (incomeByMonth.get(m) ?? 0), 0);

  const parts: CostPart[] = [
    { key: 'interest', name: 'Kreditzinsen', monthly: interest },
    { key: 'account', name: 'Kontoführung', monthly: fees },
    { key: 'orders', name: 'Ordergebühren', monthly: orders },
    { key: 'fx', name: 'Fremdwährung', monthly: fx },
  ];
  const overview = costsOverview({ available, parts, earnings, incomeCents });

  // Credit lines: loans, cards and overdraft frames, with their terms.
  const summaries = accountSummaries(db, today);
  const creditLines: CreditLineRow[] = summaries
    .filter(
      (a) =>
        a.closedAt === null &&
        (a.type === 'loan' ||
          a.type === 'credit_card' ||
          (a.overdraftLimitCents ?? 0) > 0 ||
          (a.creditLimitCents ?? 0) > 0),
    )
    .map((a) => {
      const own = interestByAccount.get(a.id);
      return {
        id: a.id,
        name: a.name,
        institutionId: a.institutionId,
        type: a.type,
        limitCents:
          a.type === 'checking' || a.type === 'cash'
            ? a.overdraftLimitCents
            : (a.creditLimitCents ?? a.overdraftLimitCents),
        usedCents: Math.max(0, -a.balanceCents),
        rateBp: a.interestRateBp,
        interestKind: a.interestKind,
        installmentCents: a.installmentCents,
        termStart: a.termStart,
        originalAmountCents: a.originalAmountCents,
        termEnd: a.termEnd,
        interest12Cents:
          a.type === 'loan' ? window12.reduce((s, m) => s + (own?.[m] ?? 0), 0) : null,
        currency: a.currency,
      };
    });

  // The loan scenario needs exactly one loan with a rate and its payments from the contracts.
  const loans = summaries.filter(
    (a) => a.type === 'loan' && a.closedAt === null && (a.interestRateBp ?? 0) > 0,
  );
  let loan: LoanScenario | null = null;
  const only = loans.length === 1 ? loans[0] : undefined;
  if (only && only.currency === 'EUR' && only.balanceCents < 0) {
    const fxLookup = (currency: string, day: string) =>
      fxRateOnOrBefore(db, currency, day)?.rateMicro ?? null;
    const sources = contractSources(db);
    const debt = sources.filter((s) => s.categoryKind === 'debt');
    const minimum = contractsOverview(
      today,
      debt.filter((s) => contractBinding(s) === 'fixed'),
      fxLookup,
    );
    const extraSources = debt.filter((s) => contractBinding(s) === null);
    const extra = contractsOverview(
      today,
      extraSources.map((s) => ({ ...s, categoryKind: 'fixed' as const })),
      fxLookup,
    );
    // The loan's own terms (Einstellungen › Konten) win over the expected payments.
    const paymentSource = only.installmentCents !== null ? 'terms' : 'contracts';
    const paymentCents = only.installmentCents ?? minimum.fixedMonthlyCents;
    const extraCents = extra.fixedMonthlyCents;
    let plan: PayoffPlan | null = null;
    let belowInterest = false;
    try {
      plan = payoffPlan({
        balanceCents: -only.balanceCents,
        rateBp: only.interestRateBp as number,
        paymentCents,
        extraCents,
        monthlyFeeCents: only.monthlyFeeCents ?? 0,
        startMonth: addMonths(monthOf(today), 1),
      });
    } catch (error) {
      if (error instanceof PaymentBelowInterestError) belowInterest = true;
      else throw error;
    }
    loan = {
      accountId: only.id,
      name: only.name,
      rateBp: only.interestRateBp as number,
      balanceCents: -only.balanceCents,
      paymentCents,
      paymentSource,
      interestKind: only.interestKind,
      extraCents,
      plan,
      belowInterest,
    };
  }

  return {
    ...overview,
    from: first ? `${first}-01` : null,
    to: last ? lastDayOfMonth(last) : null,
    partLabels: Object.fromEntries(parts.map((p) => [p.key, p.name])),
    creditLines,
    loan,
    loanCount: loans.length,
    foreignFeeBookings,
    skippedForeignTrades,
  };
}

export interface FundCostsReport {
  /**
   * Fund costs (TER on the month-end values plus broker fees) of the last twelve months from the
   * shared portfolio summary. Never booked, so never part of the cost sums; an estimate.
   */
  fundCosts: { terCents: number; feesCents: number; costRateBp: number; valueCents: number } | null;
  /** A price or rate for the valuation is missing. */
  unavailable: boolean;
}

/** Separate and slower: the valuation of every position, so the page loads it after the rest. */
export function fundCostsReport(db: Executor, today: string): FundCostsReport {
  let fundCosts: FundCostsReport['fundCosts'] = null;
  let unavailable = false;
  try {
    const summary = portfolioSummary(db, { today, period: '1J' });
    if (summary.valueCents > 0)
      fundCosts = {
        terCents: summary.costs.terCents,
        feesCents: summary.costs.feesCents,
        costRateBp: summary.costs.costRateBp,
        valueCents: summary.valueCents,
      };
  } catch (error) {
    if (
      error instanceof MissingFxRateError ||
      error instanceof PriceUnavailableError ||
      error instanceof ExchangeRateUnavailableError
    )
      unavailable = true;
    else throw error;
  }
  return { fundCosts, unavailable };
}
