import {
  addMonths,
  cents,
  contractBinding,
  contractsOverview,
  costsOverview,
  monthlyInterestCents,
  simulateLoan,
  settlementCents,
  toEurCents,
  rateInForce,
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
import { eq, isNull } from 'drizzle-orm';
import {
  account,
  booking,
  bookingSplit,
  INCOME_TYPES,
  trade,
  category,
  categoryGroup,
  payee,
  loanRateChange,
} from '../schema';
import { MissingFxRateError } from './errors';
import { contractSources } from './contracts-report';
import { portfolioSummary } from './portfolio-summary';
import { accountBalances } from './queries';
import { accountSummaries } from './ledger-queries';
import { fxRateOnOrBefore } from './prices';
import { reportTables } from './report-tables';
import { reportMonths } from './spending-report';
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
  /** Distinct source bookings omitted because their dated FX conversion is missing. */
  skippedForeignBookings: number;
  sources: Array<{ id: string; name: string; kind: string; cents: number; derived: boolean }>;
  monthly: Array<{
    month: string;
    parts: Record<string, number>;
    totalCents: number;
    earningsCents: number;
  }>;
}

const monthKey = (day: string) => day.slice(0, 7);
const add = (map: Record<string, number>, month: string, value: number) => {
  map[month] = cents((map[month] ?? 0) + value);
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
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const interest: Record<string, number> = {};
  const modeledInterest: Record<string, number> = {};
  const skippedBookings = new Set<string>();
  const fees: Record<string, number> = {};
  const overdraft: Record<string, number> = {};
  const orders: Record<string, number> = {};
  const fx: Record<string, number> = {};
  const earnings: Record<string, number> = {};
  const interestByAccount = new Map<string, Record<string, number>>();
  const sourceMap = new Map<
    string,
    { id: string; name: string; kind: string; cents: number; derived: boolean }
  >();
  const addSource = (
    id: string,
    name: string,
    kind: string,
    month: string,
    cents: number,
    derived = false,
  ) => {
    if (!last12.has(month)) return;
    const key = `${kind}:${id}`;
    const old = sourceMap.get(key) ?? { id: key, name, kind, cents: 0, derived: false };
    old.cents += cents;
    old.derived ||= derived;
    sourceMap.set(key, old);
  };
  const convert = (cents: number, currency: string, date: string) => {
    if (currency === 'EUR') return cents;
    const rate = fxRateOnOrBefore(db, currency, date)?.rateMicro;
    return rate == null ? null : toEurCents(cents, rate);
  };
  const entries = db
    .select({ b: booking, systemKind: payee.systemKind })
    .from(booking)
    .leftJoin(payee, eq(payee.id, booking.payeeId))
    .where(isNull(booking.deletedAt))
    .all();
  const rows = entries.filter(({ b, systemKind }) => {
    const a = accountById.get(b.accountId);
    return a && b.date >= a.openingDate && inWindow.has(monthKey(b.date)) && systemKind === null;
  });
  let foreignFeeBookings = 0;
  for (const { b } of rows) {
    if (b.fxFeeCents === null || b.fxFeeCents === 0 || b.transferId !== null) continue;
    const month = monthKey(b.date);
    const cost = convert(-b.fxFeeCents, b.currency, b.date);
    if (cost === null) {
      skippedBookings.add(b.id);
      continue;
    }
    add(fx, month, cost);
    addSource(b.accountId, accountById.get(b.accountId)!.name, 'fx', month, cost);
    if (last12.has(month)) foreignFeeBookings++;
  }
  const liveIds = new Set(rows.map(({ b }) => b.id));
  const explicitMonths = new Set<string>();
  const checkingInterestMonths = new Set<string>();
  const costSplits = db
    .select({ split: bookingSplit, b: booking, cat: category, groupName: categoryGroup.name })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .leftJoin(category, eq(category.id, bookingSplit.categoryId))
    .leftJoin(categoryGroup, eq(categoryGroup.id, category.groupId))
    .where(isNull(booking.deletedAt))
    .all();
  const liveTrades = db.select().from(trade).where(isNull(trade.deletedAt)).all();
  const tradeBookingIds = new Set(liveTrades.flatMap((t) => (t.bookingId ? [t.bookingId] : [])));
  // Match each unlinked payout once by its settlement amount, day and cash account.
  const unmatchedPayouts = liveTrades.filter(
    (t) =>
      (t.kind === 'dividend' || t.kind === 'interest') &&
      !t.bookingId &&
      inWindow.has(monthKey(t.date)) &&
      accountById.has(t.accountId),
  );
  for (const { split, b, cat, groupName } of costSplits) {
    if (
      !liveIds.has(b.id) ||
      b.transferId !== null ||
      split.transferId !== null ||
      split.contactId !== null
    )
      continue;
    const month = monthKey(b.date);
    if (
      split.incomeTypeId === INCOME_TYPES.capital.id &&
      split.amountCents !== 0 &&
      !tradeBookingIds.has(b.id)
    ) {
      const match = unmatchedPayouts.findIndex(
        (t) =>
          t.date === b.date &&
          t.accountId === b.accountId &&
          settlementCents(t) === split.amountCents,
      );
      if (match >= 0) unmatchedPayouts.splice(match, 1);
      else {
        const value = convert(split.amountCents, b.currency, b.date);
        if (value !== null) add(earnings, month, value);
        else skippedBookings.add(b.id);
      }
    }
    if (
      !cat ||
      cat.deletedAt !== null ||
      groupName !== BANK_FEE_GROUP ||
      ['debt', 'invest', 'card_payment', 'advance', 'income'].includes(cat.kind) ||
      tradeBookingIds.has(b.id)
    )
      continue;
    const value = convert(-split.amountCents, b.currency, b.date);
    if (value === null) {
      skippedBookings.add(b.id);
      continue;
    }
    const kind = loanIds.has(b.accountId)
      ? 'interest'
      : /sollzins|dispo|überziehungszins/i.test(cat.name)
        ? 'overdraft'
        : /zins|interest/i.test(cat.name)
          ? 'interest'
          : 'account';
    const map = kind === 'interest' ? interest : kind === 'overdraft' ? overdraft : fees;
    add(map, month, value);
    addSource(
      kind === 'interest' ? b.accountId : `${b.accountId}:${cat.id}`,
      kind === 'interest'
        ? accountById.get(b.accountId)!.name
        : `${accountById.get(b.accountId)!.name} · ${cat.name}`,
      kind,
      month,
      value,
    );
    if (kind === 'interest') {
      if (accountById.get(b.accountId)?.type === 'checking') checkingInterestMonths.add(month);
      explicitMonths.add(`${b.accountId}:${month}`);
      const own = interestByAccount.get(b.accountId) ?? {};
      add(own, month, value);
      interestByAccount.set(b.accountId, own);
    }
  }
  // A monthly terms model supplies only missing interest components, never principal.
  const changes = db.select().from(loanRateChange).where(isNull(loanRateChange.deletedAt)).all();
  for (const a of accounts.filter(
    (a) => a.type === 'loan' && a.interestRateBp !== null && a.installmentCents !== null,
  )) {
    const rates = changes
      .filter((r) => r.accountId === a.id)
      .map((r) => ({ month: r.validFrom.slice(0, 7), rateBp: r.rateBp }));
    let model: Array<{ month: string; interestCents: number; feeCents: number }> = [];
    if (a.originalAmountCents && a.termStart) {
      try {
        model = simulateLoan({
          balanceCents: a.originalAmountCents,
          startMonth: monthOf(a.termStart),
          rateBp: a.interestRateBp!,
          installmentCents: a.installmentCents!,
          monthlyFeeCents: a.monthlyFeeCents ?? 0,
          rateChanges: rates,
        }).rows;
      } catch (e) {
        if (!(e instanceof PaymentBelowInterestError)) throw e;
      }
    }
    for (const month of available) {
      if (
        explicitMonths.has(`${a.id}:${month}`) ||
        checkingInterestMonths.has(month) ||
        (a.closedAt && a.closedAt.slice(0, 7) < month) ||
        (a.termEnd && a.termEnd.slice(0, 7) < month) ||
        month < monthOf(a.termStart ?? a.openingDate)
      )
        continue;
      const modeled = model.find((r) => r.month === month);
      const opening =
        a.originalAmountCents && a.termStart
          ? null
          : accountBalances(db, lastDayOfMonth(addMonths(month, -1))).find(
              (r) => r.accountId === a.id,
            )?.balanceCents;
      const native =
        modeled?.interestCents ??
        (opening != null && opening < 0
          ? monthlyInterestCents(-opening, rateInForce(a.interestRateBp!, rates, month))
          : 0);
      const value = convert(native, a.currency, `${month}-15`);
      if (value === null || value === 0) continue;
      add(modeledInterest, month, value);
      addSource(a.id, a.name, 'modeledInterest', month, value, true);
      const own = interestByAccount.get(a.id) ?? {};
      add(own, month, value);
      interestByAccount.set(a.id, own);
    }
  }
  let skippedForeignTrades = 0;
  for (const t of liveTrades) {
    const month = monthKey(t.date);
    const a = accountById.get(t.accountId);
    if (!a || !inWindow.has(month) || t.date < a.openingDate) continue;
    const cost = convert(t.feeCents + (t.kind === 'fee' ? t.amountCents : 0), a.currency, t.date);
    if (cost === null) {
      skippedForeignTrades++;
      continue;
    }
    add(orders, month, cost);
    addSource(a.id, a.name, 'orders', month, cost);
    if (t.kind === 'dividend' || t.kind === 'interest') {
      const earned = convert(cents(t.amountCents - t.taxCents), a.currency, t.date);
      if (earned !== null) add(earnings, month, earned);
    }
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
    { key: 'interest', name: 'Kreditzinsen · gebucht', monthly: interest },
    {
      key: 'modeledInterest',
      name: 'Kreditzinsen · aus Konditionen geschätzt',
      monthly: modeledInterest,
    },
    { key: 'account', name: 'Kontoführung / Karten / Bankgebühren', monthly: fees },
    { key: 'orders', name: 'Depot- / Transaktionsgebühren', monthly: orders },
    { key: 'fx', name: 'Fremdwährungsgebühren', monthly: fx },
    { key: 'overdraft', name: 'Sollzinsen / Dispo', monthly: overdraft },
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
      debt.filter((s) => contractBinding(s, today) === 'fixed'),
      fxLookup,
    );
    const extraSources = debt.filter((s) => contractBinding(s, today) === null);
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
    sources: [...sourceMap.values()].filter((s) => s.cents !== 0).sort((a, b) => b.cents - a.cents),
    monthly: overview.months.map((month) => ({
      month,
      parts: Object.fromEntries(parts.map((p) => [p.key, p.monthly[month] ?? 0])),
      totalCents: parts.reduce((a, p) => a + (p.monthly[month] ?? 0), 0),
      earningsCents: earnings[month] ?? 0,
    })),
    from: first ? `${first}-01` : null,
    to: last ? lastDayOfMonth(last) : null,
    partLabels: Object.fromEntries(parts.map((p) => [p.key, p.name])),
    creditLines,
    loan,
    loanCount: loans.length,
    foreignFeeBookings,
    skippedForeignTrades,
    skippedForeignBookings: skippedBookings.size,
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
