import { z } from 'zod';
import { addDays, daysBetween, lastDayOfMonth, monthOf } from '../date';
import { simulateLoan, type LoanMeasure } from '../debt/loan-plan';
import { evenDaily, liquidityForecast, lowPoint, type ForecastItem } from '../forecast/liquidity';
import { incomePauseAmount } from '../forecast/income-pause';
import { shareOf } from '../schedule/occurrences';
import { plannedEventOccurrences } from '../planned-events';
import { isLiquidityAccount } from '../forecast/liquidity-account';

const date = z.iso.date().refine((d) => d >= '1900-01-01' && d <= '9899-12-31');
const cents = z.int().min(-1_000_000_000_000).max(1_000_000_000_000);
const positive = cents.refine((n) => n > 0);
const id = z.string().min(1);
const delay = z.union([
  z.int().min(0).max(365),
  z
    .object({ min: z.int().min(0), max: z.int().max(365) })
    .strict()
    .refine((r) => r.min <= r.max),
]);
export const assumptionSchema = z.discriminatedUnion('kind', [
  z.object({ id, kind: z.literal('delayedIncome'), inflowId: id, days: delay }).strict(),
  z
    .object({
      id,
      kind: z.literal('incomeInterruption'),
      paymentId: id,
      from: date,
      to: date,
      /** Share of income lost, in basis points. */
      shareBp: z.int().min(0).max(10_000),
    })
    .strict()
    .refine((a) => a.from <= a.to),
  z
    .object({ id, kind: z.literal('largerPurchase'), date, amountCents: positive, accountId: id })
    .strict(),
  z
    .object({
      id,
      kind: z.literal('specialLoanRepayment'),
      date,
      amountCents: positive,
      loanId: id,
    })
    .strict(),
  z
    .object({
      id,
      kind: z.literal('changedSavingsRate'),
      from: date,
      deltaMonthlyCents: cents,
      savingsPlanId: id,
    })
    .strict(),
]);
export type Assumption = z.infer<typeof assumptionSchema>;

const itemSchema = z
  .object({
    id,
    accountId: id,
    day: date,
    cents,
    kind: z.enum(['income', 'fixed', 'event']),
    expected: z.boolean(),
    paymentId: id.optional(),
    source: z
      .object({
        kind: z.enum([
          'expectedOccurrence',
          'plannedEvent',
          'loanInstalment',
          'cardPayment',
          'cardCredit',
        ]),
        id,
        dueDay: date,
        bookingId: id.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const loanSchema = z
  .object({
    id,
    accountId: id,
    paymentDay: z.int().min(1).max(31),
    terms: z
      .object({
        balanceCents: cents.refine((n) => n >= 0),
        startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        rateBp: z.int().min(0).max(100_000),
        installmentCents: positive,
        monthlyFeeCents: cents.refine((n) => n >= 0),
        rateChanges: z.array(
          z
            .object({
              month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
              rateBp: z.int().min(0).max(100_000),
            })
            .strict(),
        ),
      })
      .strict(),
    repayments: z
      .array(z.object({ assumptionId: id, date, amountCents: positive }).strict())
      .max(12),
  })
  .strict();
export const snapshotSchema = z
  .object({
    asOf: date,
    /** Last date for which the supplied schedule is complete. */
    through: date,
    accounts: z
      .array(
        z
          .object({
            id,
            balanceCents: cents,
            onBudget: z.boolean(),
            role: z.string().nullable(),
            closedAt: date.nullable(),
            openingDate: date,
            currency: z.literal('EUR'),
            variableMonthlyCents: cents.refine((n) => n >= 0).optional(),
          })
          .strict(),
      )
      .min(1),
    items: z.array(itemSchema),
    loans: z.array(loanSchema),
    /** A cash transfer, not envelope funding. Positive delta moves more to the destination. */
    savingsPlans: z.array(
      z
        .object({
          id,
          fromAccountId: id,
          toAccountId: id,
          dayOfMonth: z.int().min(1).max(31),
          monthlyCents: cents.refine((n) => n >= 0),
          changes: z
            .array(z.object({ assumptionId: id, from: date, deltaMonthlyCents: cents }).strict())
            .max(12)
            .optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type Snapshot = z.infer<typeof snapshotSchema>;
export const scenarioSchema = z
  .object({
    version: z.literal(1),
    id,
    name: z.string().trim().min(1),
    baselineAsOf: date,
    baseline: snapshotSchema,
    assumptions: z.array(assumptionSchema).max(12),
  })
  .strict()
  .refine((s) => s.baselineAsOf === s.baseline.asOf);
export type Scenario = z.infer<typeof scenarioSchema>;
export interface AdjustedInputs {
  /** Exhaustive discrete possibilities, never probabilities or confidence intervals. */
  variants: Snapshot[];
}
export interface Horizon {
  through: string;
  bufferCents?: number;
}

function unique(ids: string[]): void {
  if (new Set(ids).size !== ids.length) throw new RangeError('Duplicate identity');
}
function validate(input: Snapshot): void {
  snapshotSchema.parse(input);
  if (input.through < input.asOf || daysBetween(input.asOf, input.through) > 3660)
    throw new RangeError('Invalid snapshot coverage (maximum ten years)');
  unique(input.accounts.map((a) => a.id));
  unique(input.items.map((a) => a.id));
  unique(input.loans.map((a) => a.id));
  unique(input.savingsPlans.map((a) => a.id));
  const account = (accountId: string) => {
    if (!input.accounts.some((a) => a.id === accountId)) throw new RangeError('Unknown account');
  };
  input.items.forEach((i) => {
    account(i.accountId);
    const dayZeroObligation =
      i.day === input.asOf &&
      !i.expected &&
      ((i.kind === 'fixed' && i.cents < 0 && i.source?.kind === 'expectedOccurrence') ||
        (i.kind === 'event' && i.cents !== 0 && i.source?.kind === 'cardPayment')) &&
      i.source.bookingId === undefined &&
      i.source.dueDay <= input.asOf;
    if ((i.day <= input.asOf && !dayZeroObligation) || i.day > input.through)
      throw new RangeError('Item outside snapshot coverage');
  });
  input.loans.forEach((l) => {
    account(l.accountId);
    unique(l.repayments.map((r) => r.assumptionId));
    if (paymentDate(l.terms.startMonth, l.paymentDay) <= input.asOf)
      throw new RangeError('First loan payment must follow the baseline date');
    l.repayments.forEach((r) => {
      if (r.date <= input.asOf || r.date > input.through || monthOf(r.date) < l.terms.startMonth)
        throw new RangeError('Repayment outside loan coverage');
    });
  });
  input.savingsPlans.forEach((s) => {
    unique((s.changes ?? []).map((c) => c.assumptionId));
    account(s.fromAccountId);
    account(s.toAccountId);
    if (s.fromAccountId === s.toAccountId)
      throw new RangeError('Savings transfer needs distinct accounts');
    for (const day of savingsDates(input, s.dayOfMonth)) {
      if (savingsAmount(s, day) < 0 || !Number.isSafeInteger(savingsAmount(s, day)))
        throw new RangeError('Savings rate would be negative or unsafe');
    }
  });
  // Saved scenarios must reject duplicate source/generated legs before evaluation too.
  resolvedItems(input);
}

function applyOne(input: Snapshot, a: Assumption): Snapshot {
  const next: Snapshot = JSON.parse(JSON.stringify(input));
  const future = (d: string) => {
    if (d <= input.asOf || d > input.through)
      throw new RangeError('Assumption outside snapshot coverage');
  };
  switch (a.kind) {
    case 'delayedIncome': {
      const item = next.items.find(
        (i) => i.id === a.inflowId && i.kind === 'income' && i.cents > 0,
      );
      if (!item) throw new RangeError('Unknown positive inflow');
      if (typeof a.days !== 'number') throw new RangeError('Unresolved delay range');
      item.day = addDays(item.day, a.days);
      // A delayed occurrence may leave the coverage window; do not silently drop it.
      if (item.day > input.through) throw new RangeError('Delay exceeds snapshot coverage');
      break;
    }
    case 'incomeInterruption': {
      const matches = next.items.filter(
        (i) => i.paymentId === a.paymentId && i.kind === 'income' && i.cents > 0,
      );
      if (!matches.length) throw new RangeError('Unknown income source');
      for (const item of matches) {
        const paused = incomePauseAmount(
          {
            expectedPaymentId: a.paymentId,
            dueDate: item.day,
            kind: 'inflow',
            currency: 'EUR',
            amountCents: item.cents,
          },
          { expectedPaymentId: a.paymentId, startDate: a.from, endDate: a.to },
        );
        if (paused === 0) item.cents -= shareOf(item.cents, a.shareBp);
      }
      break;
    }
    case 'largerPurchase':
      future(a.date);
      if (!next.accounts.some((v) => v.id === a.accountId))
        throw new RangeError('Unknown purchase account');
      if (next.items.some((i) => i.id === `assumption:${a.id}`))
        throw new RangeError('Duplicate generated item');
      next.items.push({
        id: `assumption:${a.id}`,
        accountId: a.accountId,
        day: a.date,
        cents: -a.amountCents,
        kind: 'event',
        expected: false,
      });
      break;
    case 'specialLoanRepayment': {
      future(a.date);
      const loan = next.loans.find((l) => l.id === a.loanId);
      if (!loan || monthOf(a.date) < loan.terms.startMonth)
        throw new RangeError('Unknown or not yet modelled loan');
      loan.repayments.push({ assumptionId: a.id, date: a.date, amountCents: a.amountCents });
      break;
    }
    case 'changedSavingsRate': {
      // Resolve the change to dated transfers using the existing event recurrence expansion.
      const plan = next.savingsPlans.find((s) => s.id === a.savingsPlanId);
      if (!plan) throw new RangeError('Unknown savings plan');
      plan.changes = [
        ...(plan.changes ?? []),
        { assumptionId: a.id, from: a.from, deltaMonthlyCents: a.deltaMonthlyCents },
      ];
      for (const day of savingsDates(input, plan.dayOfMonth)) {
        if (savingsAmount(plan, day) < 0) throw new RangeError('Savings rate would be negative');
      }
      break;
    }
  }
  validate(next);
  return next;
}

/** No assumptions preserves the exact baseline reference. Order is explicit and significant. */
export function applyAssumptions(
  baseline: Snapshot,
  assumptions: readonly Assumption[],
): Snapshot | AdjustedInputs {
  validate(baseline);
  unique(assumptions.map((a) => a.id));
  let variants = [baseline];
  for (const raw of assumptions) {
    const a = assumptionSchema.parse(raw);
    const choices: Assumption[] =
      a.kind === 'delayedIncome' && typeof a.days !== 'number'
        ? Array.from({ length: a.days.max - a.days.min + 1 }, (_, i) => ({
            ...a,
            days: (a.days as { min: number }).min + i,
          }))
        : [a];
    if (variants.length * choices.length > 4096)
      throw new RangeError('Too many uncertainty combinations (maximum 4096)');
    variants = variants.flatMap((v) => choices.map((c) => applyOne(v, c)));
  }
  return variants.length === 1 ? variants[0]! : { variants };
}

function savingsDates(input: Snapshot, day: number): string[] {
  const year = Number(input.asOf.slice(0, 4)) - 1;
  return plannedEventOccurrences(
    {
      id: 'savings',
      name: 'Sparrate',
      date: `${year}-01-${String(day).padStart(2, '0')}`,
      amountCents: 0,
      categoryId: null,
      enabled: true,
      recurrence: 'monthly',
      recurrenceMonths: [],
      recurrenceUntil: null,
    },
    addDays(input.asOf, 1),
    input.through,
  ).map((o) => o.date);
}

function paymentDate(month: string, day: number): string {
  return `${month}-${String(Math.min(day, Number(lastDayOfMonth(month).slice(8)))).padStart(2, '0')}`;
}

function savingsAmount(plan: Snapshot['savingsPlans'][number], day: string): number {
  return (
    plan.monthlyCents +
    (plan.changes ?? [])
      .filter((c) => c.from <= day)
      .reduce((sum, c) => sum + c.deltaMonthlyCents, 0)
  );
}

function resolvedItems(input: Snapshot): z.infer<typeof itemSchema>[] {
  const items = [...input.items];
  for (const plan of input.savingsPlans) {
    for (const day of savingsDates(input, plan.dayOfMonth)) {
      items.push(
        {
          id: `savings:${plan.id}:${day}:out`,
          accountId: plan.fromAccountId,
          day,
          cents: -savingsAmount(plan, day),
          kind: 'event',
          expected: false,
        },
        {
          id: `savings:${plan.id}:${day}:in`,
          accountId: plan.toAccountId,
          day,
          cents: savingsAmount(plan, day),
          kind: 'event',
          expected: false,
        },
      );
    }
  }
  for (const loan of input.loans) {
    const measures: LoanMeasure[] = loan.repayments.map((r) => ({
      kind: 'one_off',
      month: monthOf(r.date),
      amountCents: r.amountCents,
    }));
    const schedule = simulateLoan(loan.terms, measures);
    for (const row of schedule.rows) {
      const day = `${row.month}-${String(Math.min(loan.paymentDay, Number(lastDayOfMonth(row.month).slice(8)))).padStart(2, '0')}`;
      items.push({
        id: `loan:${loan.id}:${row.month}`,
        accountId: loan.accountId,
        day,
        cents: -row.regularCents,
        kind: 'fixed',
        expected: false,
      });
      let extra = row.extraCents;
      for (const r of loan.repayments
        .filter((r) => monthOf(r.date) === row.month)
        .toSorted((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
        const paid = Math.min(extra, r.amountCents);
        extra -= paid;
        items.push({
          id: `loan:${loan.id}:${r.assumptionId}`,
          accountId: loan.accountId,
          day: r.date,
          cents: -paid,
          kind: 'event',
          expected: false,
        });
      }
    }
  }
  unique(items.map((item) => item.id));
  return items;
}

function project(input: Snapshot, horizon: Horizon, withoutExpected: boolean) {
  const days = daysBetween(input.asOf, horizon.through);
  const items = resolvedItems(input).filter((i) => !(withoutExpected && i.expected && i.cents > 0));
  // Bound every intermediate addition, including cancellation and household aggregation.
  // A safe final number alone does not prove safe IEEE-754 arithmetic in the shared engine.
  const absolute = (n: number) => BigInt(Math.abs(n));
  let arithmeticBudget = 0n;
  for (const account of input.accounts) {
    arithmeticBudget += absolute(account.balanceCents);
    arithmeticBudget +=
      BigInt(account.variableMonthlyCents ?? 0) * BigInt(Math.ceil(days / 28) + 1);
  }
  for (const item of items) {
    if (item.day <= horizon.through) arithmeticBudget += absolute(item.cents);
  }
  if (arithmeticBudget > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('Unsafe intermediate cent arithmetic');
  const accounts = input.accounts.map((a) => {
    const accountItems = items.filter((i) => i.accountId === a.id);
    const dayZeroCents = accountItems
      .filter((i) => i.day === input.asOf)
      .reduce((sum, i) => sum + i.cents, 0);
    const forecast = liquidityForecast({
      startDay: input.asOf,
      startCents: a.balanceCents + dayZeroCents,
      days,
      items: accountItems satisfies ForecastItem[],
      variablePerDay: evenDaily(() => a.variableMonthlyCents ?? 0),
    });
    const series = forecast.days.map((d) => ({ day: d.day, cents: d.balanceCents }));
    if (series.some((d) => !Number.isSafeInteger(d.cents)))
      throw new RangeError('Unsafe account balance');
    return {
      accountId: a.id,
      paymentAccount: isLiquidityAccount(a, input.asOf),
      series,
      lowest: lowPoint(forecast.days, days)!,
    };
  });
  const series = accounts[0]!.series.map((d, i) => ({
    day: d.day,
    cents: accounts.reduce((sum, a) => sum + a.series[i]!.cents, 0),
  }));
  if (series.some((d) => !Number.isSafeInteger(d.cents)))
    throw new RangeError('Unsafe household balance');
  const lowest = series.reduce((a, b) => (b.cents < a.cents ? b : a));
  const breach = (limit: number) => {
    for (let i = 0; i < series.length; i++) {
      const found = accounts
        .filter((a) => a.paymentAccount && a.series[i]!.cents < limit)
        .map((a) => ({ accountId: a.accountId, ...a.series[i]! }));
      if (found.length) return found;
    }
    return [];
  };
  return {
    accounts,
    household: { series, lowest },
    firstBelowZero: breach(0),
    firstBelowBuffer: breach(horizon.bufferCents ?? 0),
  };
}

export function evaluate(inputs: Snapshot | AdjustedInputs, horizon: Horizon) {
  date.parse(horizon.through);
  cents.refine((n) => n >= 0).parse(horizon.bufferCents ?? 0);
  const variants = 'variants' in inputs ? inputs.variants : [inputs];
  if (!variants.length) throw new RangeError('Empty uncertainty range');
  const outcomes = variants.map((input) => {
    validate(input);
    if (horizon.through < input.asOf || horizon.through > input.through)
      throw new RangeError('Horizon outside snapshot coverage');
    return {
      withExpectedInflows: project(input, horizon, false),
      withoutExpectedInflows: project(input, horizon, true),
      expectedInflows: resolvedItems(input)
        .filter((i) => i.expected && i.cents > 0 && i.day > input.asOf && i.day <= horizon.through)
        .map((i) => ({ inflowId: i.id, accountId: i.accountId, day: i.day, cents: i.cents })),
    };
  });
  const bounds = (values: number[]) => ({ min: Math.min(...values), max: Math.max(...values) });
  const range =
    outcomes.length > 1
      ? {
          accounts: inputsRangeAccounts(variants[0]!, outcomes),
          householdLowestCents: bounds(
            outcomes.map((o) => o.withExpectedInflows.household.lowest.cents),
          ),
          householdLowestWithoutExpectedCents: bounds(
            outcomes.map((o) => o.withoutExpectedInflows.household.lowest.cents),
          ),
        }
      : undefined;
  return {
    certainty: outcomes.length === 1 ? ('conditional' as const) : ('range' as const),
    outcomes,
    ...(range ? { range } : {}),
  };
}

function inputsRangeAccounts(
  input: Snapshot,
  outcomes: {
    withExpectedInflows: ReturnType<typeof project>;
    withoutExpectedInflows: ReturnType<typeof project>;
  }[],
) {
  return input.accounts.map((account, index) => {
    const rangeFor = (mode: 'withExpectedInflows' | 'withoutExpectedInflows') => {
      const lows = outcomes.map((o) => o[mode].accounts[index]!.lowest);
      const amounts = lows.map((l) => l.cents);
      return {
        minCents: Math.min(...amounts),
        maxCents: Math.max(...amounts),
        possibleLowPoints: possibilities(lows.map((l) => ({ day: l.day, cents: l.cents }))),
      };
    };
    return {
      accountId: account.id,
      withExpectedInflows: rangeFor('withExpectedInflows'),
      withoutExpectedInflows: rangeFor('withoutExpectedInflows'),
    };
  });
}

/** Stable JSON for persisted snapshots and result hashes; no locale, clock or object insertion order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const json = JSON.stringify(value);
    if (json === undefined || (typeof value === 'number' && !Number.isFinite(value)))
      throw new TypeError('Non-JSON value');
    return json;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
    )
    .join(',')}}`;
}
export function serializeScenario(scenario: Scenario): string {
  const parsed = scenarioSchema.parse(scenario);
  validate(parsed.baseline);
  applyAssumptions(parsed.baseline, parsed.assumptions);
  return canonicalJson(parsed);
}
export function deserializeScenario(json: string): Scenario {
  const scenario = scenarioSchema.parse(JSON.parse(json));
  serializeScenario(scenario);
  return scenario;
}

export interface Difference {
  figure: string;
  baseValue: unknown[];
  scenarioValue: unknown[];
  assumptionIds: string[];
  explanationDe: string;
}

/** Distinct possibilities; duplicated paths through uncertainty do not create differences. */
function possibilities(values: unknown[]): unknown[] {
  return [...new Map(values.map((v) => [canonicalJson(v), v])).entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, value]) => value);
}

function figures(result: ReturnType<typeof evaluate>, base: Snapshot) {
  const values: Record<string, { label: string; values: unknown[] }> = {};
  const put = (
    key: string,
    label: string,
    pick: (o: (typeof result.outcomes)[number]) => unknown,
  ) => {
    values[key] = { label, values: possibilities(result.outcomes.map(pick)) };
  };
  for (const mode of ['withExpectedInflows', 'withoutExpectedInflows'] as const) {
    const qualifier =
      mode === 'withExpectedInflows' ? 'mit erwarteten Eingängen' : 'ohne erwartete Eingänge';
    put(
      `${mode}.household.lowest`,
      `Tiefster Haushaltsstand ${qualifier}`,
      (o) => o[mode].household.lowest,
    );
    put(
      `${mode}.firstBelowZero`,
      `Erste Konto-Unterdeckung ${qualifier}`,
      (o) => o[mode].firstBelowZero,
    );
    put(
      `${mode}.firstBelowBuffer`,
      `Erste Unterschreitung des Puffers ${qualifier}`,
      (o) => o[mode].firstBelowBuffer,
    );
    for (const account of base.accounts) {
      const pick = (o: (typeof result.outcomes)[number]) =>
        o[mode].accounts.find((a) => a.accountId === account.id)!;
      put(
        `${mode}.account.${account.id}.lowest`,
        `Tiefster Stand auf Konto „${account.id}“ ${qualifier}`,
        (o) => {
          const low = pick(o).lowest;
          return { day: low.day, cents: low.cents };
        },
      );
      for (const day of result.outcomes[0]![mode].household.series) {
        put(
          `${mode}.account.${account.id}.${day.day}`,
          `Kontostand „${account.id}“ am ${day.day} ${qualifier}`,
          (o) => pick(o).series.find((d) => d.day === day.day)!.cents,
        );
      }
    }
  }
  put('expectedInflows', 'Erwartete Eingänge', (o) => o.expectedInflows);
  return values;
}

function germanValue(value: unknown): string {
  if (typeof value === 'number') {
    const absolute = Math.abs(value);
    return `${value < 0 ? '−' : ''}${Math.floor(absolute / 100)},${String(absolute % 100).padStart(2, '0')} €`;
  }
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.length ? value.map(germanValue).join('; ') : 'keine';
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    return [
      v.accountId ? `Konto „${v.accountId}“` : '',
      v.inflowId ? `Eingang „${v.inflowId}“` : '',
      v.day ? `am ${v.day}` : '',
      typeof v.cents === 'number' ? germanValue(v.cents) : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
  return String(value);
}

/** Base/final comparison with ordered marginal attribution. An assumption is named only
 * when its application changed this figure. This is explanatory attribution, not causal inference.
 */
export function diff(
  base: Snapshot,
  scenario: Scenario,
  horizon: Horizon = { through: base.through },
): Difference[] {
  serializeScenario(scenario);
  if (canonicalJson(base) !== canonicalJson(scenario.baseline))
    throw new RangeError('Baseline mismatch');
  const original = figures(evaluate(base, horizon), base);
  let previous = original;
  const causes = new Map<string, string[]>();
  const prefix: Assumption[] = [];
  for (const assumption of scenario.assumptions) {
    prefix.push(assumption);
    const next = figures(evaluate(applyAssumptions(base, prefix), horizon), base);
    for (const key of Object.keys(original)) {
      if (canonicalJson(previous[key]!.values) !== canonicalJson(next[key]!.values)) {
        causes.set(key, [...(causes.get(key) ?? []), assumption.id]);
      }
    }
    previous = next;
  }
  return Object.keys(original).flatMap((figure) => {
    const baseValue = original[figure]!.values;
    const scenarioValue = previous[figure]!.values;
    if (canonicalJson(baseValue) === canonicalJson(scenarioValue)) return [];
    const assumptionIds = causes.get(figure) ?? [];
    return [
      {
        figure,
        baseValue,
        scenarioValue,
        assumptionIds,
        explanationDe: `${original[figure]!.label}: Basis ${germanValue(baseValue)}; Szenario ${germanValue(scenarioValue)}. Annahmen: ${assumptionIds.map((a) => `„${a}“`).join(', ')}. Mehrere Werte sind mögliche Ergebnisse, keine Wahrscheinlichkeiten.`,
      },
    ];
  });
}
