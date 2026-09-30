import { addMonths } from '../date';
import { mulDivRound } from '../wealth/int';

/** Loans are simulated for at most 100 years. */
export const MAX_PAYOFF_MONTHS = 1200;

/** The payment does not exceed the monthly interest (and fees): the balance would never fall. */
export class PaymentBelowInterestError extends RangeError {
  readonly loanIds: string[];
  constructor(loanIds: string[]) {
    super(`Payment does not cover the monthly interest of: ${loanIds.join(', ')}`);
    this.name = 'PaymentBelowInterestError';
    this.loanIds = loanIds;
  }
}

/** Monthly interest in cents: `balance * rateBp / 120 000` (annual nominal rate / 12), rounded half up, one rounding per loan and month. */
export const monthlyInterestCents = (balanceCents: number, rateBp: number): number =>
  mulDivRound(balanceCents, rateBp, 120_000);

function assertNonNegativeInt(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${String(value)}`);
  }
}

export interface AmortizationRow {
  /** 0 = first payment. */
  index: number;
  month: string;
  openingCents: number;
  interestCents: number;
  feeCents: number;
  /** Repayment of the balance: payment minus interest and fee. */
  principalCents: number;
  paymentCents: number;
  closingCents: number;
}

export interface PayoffYear {
  year: number;
  interestCents: number;
  feeCents: number;
  principalCents: number;
  paymentCents: number;
}

export interface Amortization {
  /** Payments until the balance is 0 (0 for an empty balance). */
  months: number;
  /** Month of the last payment; `null` for an empty balance. */
  payoffMonth: string | null;
  totalInterestCents: number;
  totalFeeCents: number;
  totalPaidCents: number;
  rows: AmortizationRow[];
  perYear: PayoffYear[];
}

export interface AmortizeInput {
  balanceCents: number;
  /** Annual nominal rate in bp (6,32 % = 632). */
  rateBp: number;
  /** Regular monthly payment. */
  paymentCents: number;
  /** Extra repayment per month on top of the payment. */
  extraCents?: number;
  monthlyFeeCents?: number;
  /** Month `YYYY-MM` of the first payment. */
  startMonth: string;
  maxMonths?: number;
}

/**
 * Monthly amortisation: each month interest (and fee) is added, then the payment (regular plus
 * extra, at most what is owed) is deducted. Throws `PaymentBelowInterestError` when the payment
 * does not exceed the first month's interest plus fee.
 */
export function amortize(input: AmortizeInput): Amortization {
  const extra = input.extraCents ?? 0;
  const fee = input.monthlyFeeCents ?? 0;
  const maxMonths = input.maxMonths ?? MAX_PAYOFF_MONTHS;
  assertNonNegativeInt('balanceCents', input.balanceCents);
  assertNonNegativeInt('rateBp', input.rateBp);
  assertNonNegativeInt('paymentCents', input.paymentCents);
  assertNonNegativeInt('extraCents', extra);
  assertNonNegativeInt('monthlyFeeCents', fee);
  const pay = input.paymentCents + extra;
  const rows: AmortizationRow[] = [];
  let balance = input.balanceCents;
  if (balance > 0 && pay <= monthlyInterestCents(balance, input.rateBp) + fee) {
    throw new PaymentBelowInterestError(['loan']);
  }
  for (let i = 0; balance > 0; i++) {
    if (i >= maxMonths) throw new RangeError(`Not repaid within ${String(maxMonths)} months`);
    const interestCents = monthlyInterestCents(balance, input.rateBp);
    const owed = balance + interestCents + fee;
    const paymentCents = Math.min(owed, pay);
    const closingCents = owed - paymentCents;
    rows.push({
      index: i,
      month: addMonths(input.startMonth, i),
      openingCents: balance,
      interestCents,
      feeCents: fee,
      principalCents: paymentCents - interestCents - fee,
      paymentCents,
      closingCents,
    });
    balance = closingCents;
  }
  const sum = (pick: (r: AmortizationRow) => number): number =>
    rows.reduce((a, r) => a + pick(r), 0);
  const perYear: PayoffYear[] = [];
  for (const r of rows) {
    const year = Number(r.month.slice(0, 4));
    let y = perYear[perYear.length - 1];
    if (!y || y.year !== year) {
      y = { year, interestCents: 0, feeCents: 0, principalCents: 0, paymentCents: 0 };
      perYear.push(y);
    }
    y.interestCents += r.interestCents;
    y.feeCents += r.feeCents;
    y.principalCents += r.principalCents;
    y.paymentCents += r.paymentCents;
  }
  return {
    months: rows.length,
    payoffMonth: rows.length > 0 ? addMonths(input.startMonth, rows.length - 1) : null,
    totalInterestCents: sum((r) => r.interestCents),
    totalFeeCents: sum((r) => r.feeCents),
    totalPaidCents: sum((r) => r.paymentCents),
    rows,
    perYear,
  };
}

export interface PayoffPlan {
  base: Amortization;
  withExtra: Amortization;
  /** Interest saved by the extra repayment (base minus with extra). */
  interestSavedCents: number;
  monthsEarlier: number;
}

/** One loan without and with extra repayment: payoff month, interest saved and months earlier. */
export function payoffPlan(input: AmortizeInput & { extraCents: number }): PayoffPlan {
  const base = amortize({ ...input, extraCents: 0 });
  const withExtra = amortize(input);
  return {
    base,
    withExtra,
    interestSavedCents: base.totalInterestCents - withExtra.totalInterestCents,
    monthsEarlier: base.months - withExtra.months,
  };
}

// ---- several loans ----

/** Extra repayment order: highest rate first (avalanche, default) or smallest balance first (snowball). */
export type PayoffStrategy = 'avalanche' | 'snowball';

export interface PayoffLoan {
  id: string;
  name: string;
  balanceCents: number;
  rateBp: number;
  /** Fixed minimum payment per month. */
  minimumCents: number;
  monthlyFeeCents?: number;
}

export interface LoanOutcome {
  id: string;
  name: string;
  interestCents: number;
  feeCents: number;
  paidCents: number;
  paidOffMonth: string | null;
}

export interface StrategyRow {
  month: string;
  balanceCents: number;
  paymentCents: number;
  interestCents: number;
  feeCents: number;
  loans: Array<{ id: string; paymentCents: number; balanceCents: number }>;
}

export interface StrategyResult {
  strategy: PayoffStrategy;
  months: number;
  endMonth: string | null;
  startingDebtCents: number;
  /** Sum of the minimums plus the extra repayment; freed minimums stay in the common budget. */
  monthlyBudgetCents: number;
  interestCents: number;
  feeCents: number;
  totalPaidCents: number;
  loans: LoanOutcome[];
  rows: StrategyRow[];
}

/**
 * Pays off several loans with one monthly budget (all minimums plus `extraCents`). Each month
 * interest and fees are added, every open loan gets its minimum (at most what it owes), and the
 * rest goes to the loans in strategy order; a repaid loan's minimum stays in the budget. Throws
 * `PaymentBelowInterestError` when a loan that is still open received no more than its interest
 * and fees in a month, and `RangeError` when the horizon is exceeded.
 */
export function simulatePayoff(
  loans: ReadonlyArray<PayoffLoan>,
  options: {
    strategy?: PayoffStrategy;
    extraCents?: number;
    startMonth: string;
    maxMonths?: number;
  },
): StrategyResult {
  const strategy = options.strategy ?? 'avalanche';
  const extra = options.extraCents ?? 0;
  const maxMonths = options.maxMonths ?? MAX_PAYOFF_MONTHS;
  assertNonNegativeInt('extraCents', extra);
  for (const l of loans) {
    assertNonNegativeInt('balanceCents', l.balanceCents);
    assertNonNegativeInt('rateBp', l.rateBp);
    assertNonNegativeInt('minimumCents', l.minimumCents);
    assertNonNegativeInt('monthlyFeeCents', l.monthlyFeeCents ?? 0);
  }
  const state = loans.map((l) => ({
    ...l,
    balance: l.balanceCents,
    fee: l.monthlyFeeCents ?? 0,
    interest: 0,
    fees: 0,
    paid: 0,
    paidOffMonth: null as string | null,
  }));
  const startingDebtCents = state.reduce((a, l) => a + l.balance, 0);
  const budget = state.reduce((a, l) => a + l.minimumCents, 0) + extra;
  const rows: StrategyRow[] = [];
  const done = (): StrategyResult => ({
    strategy,
    months: rows.length,
    endMonth: rows.length > 0 ? (rows[rows.length - 1]?.month ?? null) : null,
    startingDebtCents,
    monthlyBudgetCents: budget,
    interestCents: state.reduce((a, l) => a + l.interest, 0),
    feeCents: state.reduce((a, l) => a + l.fees, 0),
    totalPaidCents: state.reduce((a, l) => a + l.paid, 0),
    loans: state.map((l) => ({
      id: l.id,
      name: l.name,
      interestCents: l.interest,
      feeCents: l.fees,
      paidCents: l.paid,
      paidOffMonth: l.paidOffMonth,
    })),
    rows,
  });
  for (let i = 0; ; i++) {
    const active = state.filter((l) => l.balance > 0);
    if (active.length === 0) return done();
    if (i >= maxMonths) throw new RangeError(`Not repaid within ${String(maxMonths)} months`);
    const month = addMonths(options.startMonth, i);
    const charges = new Map<string, number>();
    let monthInterest = 0;
    let monthFees = 0;
    const payments = new Map<string, number>();
    let funds = budget;
    for (const l of active) {
      const interest = monthlyInterestCents(l.balance, l.rateBp);
      l.balance += interest + l.fee;
      l.interest += interest;
      l.fees += l.fee;
      charges.set(l.id, interest + l.fee);
      monthInterest += interest;
      monthFees += l.fee;
      const payment = Math.min(l.minimumCents, l.balance);
      l.balance -= payment;
      l.paid += payment;
      funds -= payment;
      payments.set(l.id, payment);
    }
    const ranked = [...active].sort(
      strategy === 'avalanche'
        ? (a, b) => b.rateBp - a.rateBp || a.balance - b.balance || a.id.localeCompare(b.id)
        : (a, b) => a.balance - b.balance || b.rateBp - a.rateBp || a.id.localeCompare(b.id),
    );
    for (const l of ranked) {
      if (funds <= 0) break;
      const payment = Math.min(l.balance, funds);
      l.balance -= payment;
      l.paid += payment;
      funds -= payment;
      payments.set(l.id, (payments.get(l.id) ?? 0) + payment);
    }
    const stuck = active.filter(
      (l) => l.balance > 0 && (payments.get(l.id) ?? 0) <= (charges.get(l.id) ?? 0),
    );
    if (stuck.length > 0) throw new PaymentBelowInterestError(stuck.map((l) => l.id));
    for (const l of active) if (l.balance === 0 && !l.paidOffMonth) l.paidOffMonth = month;
    rows.push({
      month,
      balanceCents: state.reduce((a, l) => a + l.balance, 0),
      paymentCents: budget - funds,
      interestCents: monthInterest,
      feeCents: monthFees,
      loans: active.map((l) => ({
        id: l.id,
        paymentCents: payments.get(l.id) ?? 0,
        balanceCents: l.balance,
      })),
    });
  }
}

export interface StrategyComparison {
  avalanche: StrategyResult;
  snowball: StrategyResult;
  /** Extra interest of snowball over avalanche (>= 0 for the same budget). */
  interestAdvantageCents: number;
}

/** Avalanche against snowball with the same budget. */
export function comparePayoffStrategies(
  loans: ReadonlyArray<PayoffLoan>,
  options: { extraCents?: number; startMonth: string; maxMonths?: number },
): StrategyComparison {
  const avalanche = simulatePayoff(loans, { ...options, strategy: 'avalanche' });
  const snowball = simulatePayoff(loans, { ...options, strategy: 'snowball' });
  return {
    avalanche,
    snowball,
    interestAdvantageCents: snowball.interestCents - avalanche.interestCents,
  };
}
