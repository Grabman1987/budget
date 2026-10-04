import { z } from 'zod';
import { addMonths } from '../date';
import { MAX_PAYOFF_MONTHS, monthlyInterestCents, PaymentBelowInterestError } from './payoff';
import type { PayoffYear } from './payoff';

/**
 * Loan planning in integer cents: one loan with dated rate changes (variable conditions) and
 * scenarios (Sondertilgung once or recurring, a rate change, a higher installment) compared with the
 * baseline. Monthly model: the rate of a month is the latest change that started in or before it,
 * interest is `balance * rate / 12` rounded half up once per month, then fee and payment.
 */

const MODEL_MONTH = /^(19\d{2}|[2-8]\d{3}|9[0-8]\d{2})-(0[1-9]|1[0-2])$/;
/** Largest single amount (100 million, in cents); keeps every cent sum far below 2^53. */
export const MAX_LOAN_AMOUNT_CENTS = 10_000_000_000;
/** Largest annual rate in basis points (1 000 %). */
export const MAX_LOAN_RATE_BP = 100_000;
export const MAX_SCENARIO_MEASURES = 12;
export const LOAN_MODEL_MONTH_RE = MODEL_MONTH;

export const loanMonthSchema = z.string().regex(MODEL_MONTH);
const amount = z.int().min(1).max(MAX_LOAN_AMOUNT_CENTS);
const rate = z.int().min(0).max(MAX_LOAN_RATE_BP);

/** What a scenario changes against the baseline. */
export const loanMeasureSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('one_off'), month: loanMonthSchema, amountCents: amount }).strict(),
  z
    .object({
      kind: z.literal('recurring'),
      fromMonth: loanMonthSchema,
      /** Last month with an extra payment; `null` runs until the loan is repaid. */
      toMonth: loanMonthSchema.nullable(),
      /** Every n-th month (1 monthly, 3 quarterly, 6 half-yearly, 12 yearly). */
      everyMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
      amountCents: amount,
    })
    .strict(),
  z.object({ kind: z.literal('rate_change'), fromMonth: loanMonthSchema, rateBp: rate }).strict(),
  z
    .object({
      kind: z.literal('installment'),
      fromMonth: loanMonthSchema,
      installmentCents: amount,
    })
    .strict(),
]);
export type LoanMeasure = z.infer<typeof loanMeasureSchema>;
export type LoanMeasureKind = LoanMeasure['kind'];

export const loanScenarioInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    measures: z.array(loanMeasureSchema).min(1).max(MAX_SCENARIO_MEASURES),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [i, m] of value.measures.entries()) {
      if (m.kind === 'recurring' && m.toMonth !== null && m.toMonth < m.fromMonth)
        ctx.addIssue({
          code: 'custom',
          path: ['measures', i, 'toMonth'],
          message: 'Das Ende liegt vor dem Beginn.',
        });
      if (m.kind === 'rate_change' || m.kind === 'installment') {
        const key = `${m.kind}|${m.fromMonth}`;
        if (seen.has(key))
          ctx.addIssue({
            code: 'custom',
            path: ['measures', i, 'fromMonth'],
            message: 'Pro Monat nur eine Änderung dieser Art.',
          });
        seen.add(key);
      }
    }
  });
export type LoanScenarioInput = z.infer<typeof loanScenarioInputSchema>;

/** A dated rate of the loan; it applies from the month of `month` on. */
export interface LoanRatePoint {
  month: string;
  rateBp: number;
}

export interface LoanTermsInput {
  /** Open balance at the start (positive cents). */
  balanceCents: number;
  /** Month `YYYY-MM` of the first payment. */
  startMonth: string;
  /** Rate before the first dated change. */
  rateBp: number;
  /** Regular monthly installment. */
  installmentCents: number;
  monthlyFeeCents: number;
  /** Persisted variable conditions, any order. */
  rateChanges?: ReadonlyArray<LoanRatePoint>;
  maxMonths?: number;
}

export interface LoanScheduleRow {
  /** 0 = first payment. */
  index: number;
  month: string;
  rateBp: number;
  openingCents: number;
  interestCents: number;
  feeCents: number;
  /** Repayment of the balance (payment minus interest and fee). */
  principalCents: number;
  /** Part of the payment that is the regular installment. */
  regularCents: number;
  /** Part of the payment that is Sondertilgung. */
  extraCents: number;
  paymentCents: number;
  closingCents: number;
}

export interface LoanSummary {
  months: number;
  /** Month of the last payment; `null` when nothing is owed. */
  payoffMonth: string | null;
  totalInterestCents: number;
  totalFeeCents: number;
  totalExtraCents: number;
  totalPaidCents: number;
}

export interface LoanSchedule extends LoanSummary {
  rows: LoanScheduleRow[];
  perYear: PayoffYear[];
}

const monthIndex = (month: string): number =>
  Number(month.slice(0, 4)) * 12 + Number(month.slice(5));

function assertCents(name: string, value: number, min = 0): void {
  if (!Number.isSafeInteger(value) || value < min || value > MAX_LOAN_AMOUNT_CENTS * 100)
    throw new RangeError(`${name} out of range: ${String(value)}`);
}

/**
 * Rate in force in `month`: the latest change that has started (`<= month`), else the base rate.
 * Changes of the same month: the later entry in the list wins.
 */
export function rateInForce(
  baseRateBp: number,
  changes: ReadonlyArray<LoanRatePoint>,
  month: string,
): number {
  let best: LoanRatePoint | undefined;
  for (const c of changes) if (c.month <= month && (!best || c.month >= best.month)) best = c;
  return best ? best.rateBp : baseRateBp;
}

/**
 * Month by month schedule. The scenario's measures are applied on top of the terms: its rate changes
 * join the dated changes (same month: the scenario wins), a higher installment replaces the
 * installment from its month on, Sondertilgung adds to the payment of its months (never more than is
 * owed). Throws `PaymentBelowInterestError` when a month's payment does not exceed interest plus fee
 * and `RangeError` when the loan is not repaid within the horizon or an input is out of range.
 */
export function simulateLoan(
  terms: LoanTermsInput,
  measures: ReadonlyArray<LoanMeasure> = [],
): LoanSchedule {
  const maxMonths = terms.maxMonths ?? MAX_PAYOFF_MONTHS;
  assertCents('balanceCents', terms.balanceCents);
  assertCents('installmentCents', terms.installmentCents);
  assertCents('monthlyFeeCents', terms.monthlyFeeCents);
  if (!Number.isSafeInteger(terms.rateBp) || terms.rateBp < 0 || terms.rateBp > MAX_LOAN_RATE_BP)
    throw new RangeError('rateBp out of range');
  if (!MODEL_MONTH.test(terms.startMonth)) throw new RangeError('Invalid start month');
  if (terms.balanceCents > MAX_LOAN_AMOUNT_CENTS * 100)
    throw new RangeError('balanceCents out of range');
  const changes: LoanRatePoint[] = [
    ...(terms.rateChanges ?? []).map((c) => ({ month: c.month, rateBp: c.rateBp })),
    ...measures.flatMap((m) =>
      m.kind === 'rate_change' ? [{ month: m.fromMonth, rateBp: m.rateBp }] : [],
    ),
  ];
  for (const c of changes) {
    if (!MODEL_MONTH.test(c.month) || !Number.isSafeInteger(c.rateBp) || c.rateBp < 0)
      throw new RangeError('Invalid rate change');
  }
  const installments = measures
    .flatMap((m) =>
      m.kind === 'installment' ? [{ month: m.fromMonth, cents: m.installmentCents }] : [],
    )
    .sort((a, b) => a.month.localeCompare(b.month));
  const extraFor = (month: string): number => {
    let extra = 0;
    for (const m of measures) {
      if (m.kind === 'one_off' && m.month === month) extra += m.amountCents;
      else if (
        m.kind === 'recurring' &&
        m.fromMonth <= month &&
        (m.toMonth === null || month <= m.toMonth) &&
        (monthIndex(month) - monthIndex(m.fromMonth)) % m.everyMonths === 0
      )
        extra += m.amountCents;
    }
    return extra;
  };
  const rows: LoanScheduleRow[] = [];
  let balance = terms.balanceCents;
  for (let i = 0; balance > 0; i++) {
    if (i >= maxMonths) throw new RangeError(`Not repaid within ${String(maxMonths)} months`);
    const month = addMonths(terms.startMonth, i);
    const rateBp = rateInForce(terms.rateBp, changes, month);
    let regular = terms.installmentCents;
    for (const inst of installments) if (inst.month <= month) regular = inst.cents;
    const extra = extraFor(month);
    const interestCents = monthlyInterestCents(balance, rateBp);
    const feeCents = terms.monthlyFeeCents;
    if (regular + extra <= interestCents + feeCents) throw new PaymentBelowInterestError(['loan']);
    const owed = balance + interestCents + feeCents;
    const paymentCents = Math.min(owed, regular + extra);
    const regularCents = Math.min(paymentCents, regular);
    const closingCents = owed - paymentCents;
    rows.push({
      index: i,
      month,
      rateBp,
      openingCents: balance,
      interestCents,
      feeCents,
      principalCents: paymentCents - interestCents - feeCents,
      regularCents,
      extraCents: paymentCents - regularCents,
      paymentCents,
      closingCents,
    });
    balance = closingCents;
  }
  const sum = (pick: (r: LoanScheduleRow) => number): number => {
    const total = rows.reduce((a, r) => a + pick(r), 0);
    if (!Number.isSafeInteger(total)) throw new RangeError('Unsafe cent sum');
    return total;
  };
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
    payoffMonth: rows.length > 0 ? addMonths(terms.startMonth, rows.length - 1) : null,
    totalInterestCents: sum((r) => r.interestCents),
    totalFeeCents: sum((r) => r.feeCents),
    totalExtraCents: sum((r) => r.extraCents),
    totalPaidCents: sum((r) => r.paymentCents),
    rows,
    perYear,
  };
}

export const loanSummary = (s: LoanSchedule): LoanSummary => ({
  months: s.months,
  payoffMonth: s.payoffMonth,
  totalInterestCents: s.totalInterestCents,
  totalFeeCents: s.totalFeeCents,
  totalExtraCents: s.totalExtraCents,
  totalPaidCents: s.totalPaidCents,
});

export interface LoanComparison {
  baseline: LoanSummary;
  scenario: LoanSummary;
  /** Baseline interest minus scenario interest (negative when the scenario costs more). */
  interestSavedCents: number;
  /** Baseline months minus scenario months (negative when later). */
  monthsEarlier: number;
  /** Scenario total paid minus baseline total paid. */
  totalPaidDeltaCents: number;
}

/** A scenario against the baseline of the same terms. */
export function compareLoanScenario(
  terms: LoanTermsInput,
  measures: ReadonlyArray<LoanMeasure>,
  baseline: LoanSummary = loanSummary(simulateLoan(terms)),
): LoanComparison {
  const scenario = loanSummary(simulateLoan(terms, measures));
  return {
    baseline,
    scenario,
    interestSavedCents: baseline.totalInterestCents - scenario.totalInterestCents,
    monthsEarlier: baseline.months - scenario.months,
    totalPaidDeltaCents: scenario.totalPaidCents - baseline.totalPaidCents,
  };
}

/**
 * Indices of Sondertilgungen that lie entirely before the first modelled month: they change nothing
 * and are refused (rate and installment changes may start earlier, they define today's terms).
 */
export function measuresBeforeStart(
  measures: ReadonlyArray<LoanMeasure>,
  startMonth: string,
): number[] {
  const out: number[] = [];
  measures.forEach((m, i) => {
    if (m.kind === 'one_off' && m.month < startMonth) out.push(i);
    if (m.kind === 'recurring' && m.toMonth !== null && m.toMonth < startMonth) out.push(i);
  });
  return out;
}
