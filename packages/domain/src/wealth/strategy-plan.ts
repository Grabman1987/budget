import { z } from 'zod';
import { addMonths, lastDayOfMonth } from '../date';
import { valueAtPrice, type PriceChoice } from '../invest/series';
import { calculateStrategyTrend, type StrategyTrend, type StrategyTrendInput } from './strategy-trend';

export const STRATEGY_CATEGORIES = ['global', 'gold', 'nasdaq2x', 'eurBonds'] as const;
export type StrategyCategory = (typeof STRATEGY_CATEGORIES)[number];
export const STRATEGY_TARGETS: Record<StrategyTrend, Record<StrategyCategory, number>> = {
  weak: { global: 5000, gold: 1000, nasdaq2x: 500, eurBonds: 3500 },
  mixed: { global: 5000, gold: 1000, nasdaq2x: 1500, eurBonds: 2500 },
  strong: { global: 5000, gold: 1000, nasdaq2x: 3000, eurBonds: 1000 },
};
const identifier = z.string().trim().min(1).max(150);
const money = z.int().min(0);
export const strategyConstraintsSchema = z.strictObject({
  minimumGrossCents: money,
  fixedFeeCents: money,
  feeBp: z.int().min(0).max(10000),
  /** null is an explicitly confirmed amount-based fractional purchase, not an unknown lot. */
  unitStepE8: z.int().min(1).nullable(),
});
export const strategyConfigurationSchema = z.strictObject({
  version: z.literal(1),
  enabled: z.boolean(),
  contributionCents: money.nullable(),
  includeFreeCash: z.boolean(),
  classes: z.strictObject({ global: identifier, gold: identifier, nasdaq2x: identifier, eurBonds: identifier }),
  routes: z.array(z.strictObject({
    category: z.enum(STRATEGY_CATEGORIES),
    securityId: identifier,
    weightBp: z.int().min(1).max(10000),
    /** Explicit product confirmation: daily reset and 2× Nasdaq-100 exposure are not inferred. */
    daily2xNasdaqConfirmed: z.boolean(),
    constraints: strategyConstraintsSchema.nullable(),
  })).max(500),
}).superRefine((value, context) => {
  if (new Set(Object.values(value.classes)).size !== 4)
    context.addIssue({ code: 'custom', message: 'Jede Strategiekategorie braucht eine eigene Anlageklasse.' });
  if (new Set(value.routes.map((route) => route.securityId)).size !== value.routes.length)
    context.addIssue({ code: 'custom', message: 'Ein Kaufprodukt darf nur einmal zugeordnet sein.' });
  for (const category of STRATEGY_CATEGORIES) {
    const routes = value.routes.filter((route) => route.category === category);
    if (!routes.length || routes.reduce((sum, route) => sum + route.weightBp, 0) !== 10000)
      context.addIssue({ code: 'custom', message: `${category}: Kaufgewichte müssen zusammen 100 % ergeben.` });
  }
});
export type StrategyConfiguration = z.infer<typeof strategyConfigurationSchema>;
export type StrategyConstraints = z.infer<typeof strategyConstraintsSchema>;

function safe(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))
    throw new RangeError('Strategy amount exceeds safe integer range');
  return Number(value);
}
function integer(value: number, nonnegative = true): bigint {
  if (!Number.isSafeInteger(value) || (nonnegative && value < 0)) throw new RangeError('Invalid strategy integer');
  return BigInt(value);
}
const sum = (values: readonly number[]) => safe(values.reduce((total, value) => total + integer(value, false), 0n));

/** Largest remainder, in the caller's stable order; no cent is created or discarded. */
function distribute(cents: number, weights: readonly bigint[]): number[] {
  const amount = integer(cents), total = weights.reduce((a, b) => a + b, 0n);
  if (weights.some((weight) => weight < 0n)) throw new RangeError('Negative strategy allocation weight');
  if (total === 0n) return weights.map(() => 0);
  const rows = weights.map((weight, index) => ({ index, value: amount * weight / total, remainder: amount * weight % total }));
  let left = amount - rows.reduce((n, row) => n + row.value, 0n);
  for (const row of [...rows].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (left === 0n) break;
    row.value++; left--;
  }
  return rows.map((row) => safe(row.value));
}

export interface StrategyPosition {
  securityId: string;
  category: StrategyCategory;
  valueCents: number;
}
export type StrategyRoute = StrategyConfiguration['routes'][number] & {
  /** Canonical selected quote/execution price and stored EUR conversion, not a supplied guess. */
  quote: { choice: PriceChoice; fxRateMicro: number } | null;
}
export interface StrategyPurchase {
  securityId: string;
  idealCents: number;
  grossCents: number;
  feeCents: number;
  residualCents: number;
  unitsE8: number | null;
  quoteDate: string | null;
  quoteCurrency: string | null;
  reason: 'allocated' | 'no_deficit' | 'constraints_unknown' | 'price_unavailable' | 'below_minimum';
}
function constrainedPurchase(budget: number, route: StrategyRoute): StrategyPurchase {
  const base = { securityId: route.securityId, idealCents: budget, grossCents: 0, feeCents: 0,
    residualCents: budget, unitsE8: null, quoteDate: route.quote?.choice.price.date ?? null, quoteCurrency: route.quote?.choice.price.currency ?? null };
  if (budget === 0) return { ...base, reason: 'no_deficit' };
  const constraints = route.constraints;
  if (!constraints) return { ...base, reason: 'constraints_unknown' };
  strategyConstraintsSchema.parse(constraints);
  const cost = (gross: number) => integer(gross) + integer(constraints.fixedFeeCents)
    + (integer(gross) * BigInt(constraints.feeBp) + 9999n) / 10000n;
  const largest = (upper: number, affordable: (candidate: number) => boolean) => {
    let lo = 0n, hi = integer(upper);
    while (lo < hi) {
      const mid = (lo + hi + 1n) / 2n;
      if (affordable(Number(mid))) lo = mid; else hi = mid - 1n;
    }
    return Number(lo);
  };
  let gross: number, unitsE8: number | null = null;
  if (constraints.unitStepE8 !== null) {
    if (!route.quote || route.quote.choice.quality !== 'exact') return { ...base, reason: 'price_unavailable' };
    const step = constraints.unitStepE8;
    const value = (lots: number) => valueAtPrice(safe(integer(lots) * integer(step)), route.quote!.choice, route.quote!.fxRateMicro);
    // Cap quantity by the safe integer limit. The valuation helper may reject a larger monetary
    // result before it is compared, so an overflow means this candidate cannot be afforded.
    const lots = largest(Math.floor(Number.MAX_SAFE_INTEGER / step), (candidate) => {
      try { return cost(value(candidate)) <= integer(budget); }
      catch (error) { if (error instanceof RangeError) return false; throw error; }
    });
    unitsE8 = safe(integer(lots) * integer(step)); gross = value(lots);
  } else gross = largest(budget, (candidate) => cost(candidate) <= integer(budget));
  if (gross <= 0 || gross < constraints.minimumGrossCents) return { ...base, reason: 'below_minimum' };
  const fee = safe(cost(gross) - integer(gross));
  return { ...base, grossCents: gross, feeCents: fee, unitsE8,
    residualCents: safe(integer(budget) - cost(gross)), reason: 'allocated' };
}

/** V includes every classified holding and signed cash; opting cash in changes S, never V twice. */
export function strategyContribution(input: {
  trend: StrategyTrend; positions: readonly StrategyPosition[]; cashCents: number;
  contributionCents: number; includeFreeCash: boolean; routes: readonly StrategyRoute[];
}) {
  integer(input.cashCents, false); integer(input.contributionCents);
  if (!STRATEGY_TARGETS[input.trend] || input.positions.some((position) => !STRATEGY_CATEGORIES.includes(position.category)))
    throw new RangeError('Unmapped strategy input');
  for (const route of input.routes) {
    if (!STRATEGY_CATEGORIES.includes(route.category) || !route.securityId || integer(route.weightBp) < 1n)
      throw new RangeError('Invalid strategy routing');
  }
  if (new Set(input.routes.map((route) => route.securityId)).size !== input.routes.length)
    throw new RangeError('Duplicate strategy buy route');
  const categories = STRATEGY_CATEGORIES.map((category) => ({ category,
    valueCents: sum(input.positions.filter((position) => position.category === category).map((position) => {
      integer(position.valueCents); return position.valueCents;
    })), targetBp: STRATEGY_TARGETS[input.trend][category] }));
  const portfolioCents = sum([...categories.map((row) => row.valueCents), input.cashCents]);
  if (portfolioCents < 0) throw new RangeError('A negative portfolio cannot receive a strategy allocation');
  const cashAddedCents = input.includeFreeCash ? Math.max(0, input.cashCents) : 0;
  const fundingCents = sum([input.contributionCents, cashAddedCents]);
  const after = integer(portfolioCents) + integer(input.contributionCents);
  // Included cash is already inside V. Moving it to holdings must not increase the denominator.
  const deficits = categories.map((row) => {
    const amount = after * BigInt(row.targetBp) - integer(row.valueCents) * 10000n;
    return amount > 0n ? amount : 0n;
  });
  const allocations = distribute(fundingCents, deficits);
  const rows = categories.map((row, index) => {
    const budget = allocations[index]!;
    const routes = input.routes.filter((route) => route.category === row.category);
    if (routes.reduce((total, route) => total + route.weightBp, 0) !== 10000)
      throw new RangeError('Incomplete strategy buy routing');
    const held = (id: string) => sum(input.positions.filter((position) => position.category === row.category && position.securityId === id).map((position) => position.valueCents));
    const internal = routes.map((route) => {
      const deficit = (integer(row.valueCents) + integer(budget)) * BigInt(route.weightBp) - integer(held(route.securityId)) * 10000n;
      return deficit > 0n ? deficit : 0n;
    });
    const internalAmounts = distribute(budget, internal);
    const purchases = routes.map((route, at) => constrainedPurchase(internalAmounts[at]!, route));
    return { ...row, deficitBpCents: deficits[index]!.toString(), idealCents: budget, purchases,
      grossCents: sum(purchases.map((purchase) => purchase.grossCents)),
      feeCents: sum(purchases.map((purchase) => purchase.feeCents)),
      residualCents: budget - sum(purchases.map((purchase) => purchase.grossCents + purchase.feeCents)) };
  });
  const grossCents = sum(rows.map((row) => row.grossCents)), feeCents = sum(rows.map((row) => row.feeCents));
  return { portfolioCents, cashCents: input.cashCents, contributionCents: input.contributionCents,
    cashAddedCents, fundingCents, rows, grossCents, feeCents,
    residualCents: safe(integer(fundingCents) - integer(grossCents) - integer(feeCents)),
    status: deficits.every((value) => value === 0n) ? 'no_deficit' as const : 'preview' as const,
    executable: fundingCents > 0 && grossCents > 0 && deficits.some((value) => value > 0n) && rows.every((row) => row.purchases.every((purchase) =>
      purchase.reason !== 'constraints_unknown' && purchase.reason !== 'price_unavailable')),
  };
}

export interface StrategyMonthCalendar {
  id: string; sourceId: string; month: string; verifiedComplete: true;
  /** Complete official US session dates for this entire month, including known future dates. */
  sessions: readonly string[];
}
function validDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00.000Z`))
    && new Date(`${day}T00:00:00.000Z`).toISOString().slice(0, 10) === day;
}
export function strategyMonthSchedule(calendar: StrategyMonthCalendar) {
  if (!calendar.id.trim() || !calendar.sourceId.trim() || calendar.verifiedComplete !== true ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(calendar.month) || calendar.sessions.length < 2 ||
    calendar.sessions.some((day, index) => !validDay(day) || day.slice(0, 7) !== calendar.month || (index > 0 && day <= calendar.sessions[index - 1]!)))
    throw new RangeError('A complete verified US month calendar is required');
  return { month: calendar.month, signalDate: calendar.sessions.at(-2)!, effectiveDate: calendar.sessions.at(-1)!,
    calendarId: calendar.id, sourceId: calendar.sourceId };
}
export function strategyMonthlySignal(input: StrategyTrendInput, calendar: StrategyMonthCalendar) {
  const schedule = strategyMonthSchedule(calendar);
  if (input.calendar.id !== calendar.id)
    throw new RangeError('Signal and monthly calendar provenance disagree');
  const sessions = input.calendar.sessions.filter((session) => session.date <= schedule.signalDate);
  const signal = calculateStrategyTrend({ ...input, latestCompletedSession: schedule.signalDate,
    calendar: { ...input.calendar, sessions }, closes: input.closes.filter((close) => close.sessionDate <= schedule.signalDate) });
  return { ...schedule, signal };
}
export function nextStrategyContribution(today: string, executionCalendar?: {
  id: string; verifiedComplete: true; from: string; through: string; days: readonly string[];
}) {
  if (!validDay(today)) throw new RangeError('Invalid contribution date');
  const month = today.slice(8) <= '15' ? today.slice(0, 7) : addMonths(today.slice(0, 7), 1);
  const nominalDate = `${month}-15`;
  if (!executionCalendar) return { nominalDate, executionDate: null, calendarId: null,
    provisional: true, reason: 'execution_calendar_unavailable' as const };
  if (!executionCalendar.id.trim() || executionCalendar.verifiedComplete !== true ||
    !validDay(executionCalendar.from) || !validDay(executionCalendar.through) || executionCalendar.from > nominalDate || executionCalendar.through < nominalDate ||
    executionCalendar.days.some((day, index) => !validDay(day) || day < executionCalendar.from || day > executionCalendar.through || (index > 0 && day <= executionCalendar.days[index - 1]!)))
    throw new RangeError('Invalid verified execution calendar');
  const executionDate = executionCalendar.days.find((day) => day >= nominalDate) ?? null;
  return { nominalDate, executionDate, calendarId: executionCalendar.id, provisional: executionDate === null,
    reason: executionDate ? null : 'execution_calendar_incomplete' as const };
}

/** Category-level gross rebalance only: product sale selection, costs and tax remain explicit. */
export function strategyRebalance(input: {
  current: StrategyTrend; previous: StrategyTrend | null; effectiveDate: string;
  positions: readonly StrategyPosition[]; cashCents: number;
}) {
  if (!validDay(input.effectiveDate)) throw new RangeError('Invalid strategy effective date');
  input.positions.forEach((position) => { integer(position.valueCents);
    if (!STRATEGY_CATEGORIES.includes(position.category)) throw new RangeError('Unmapped rebalance input'); });
  integer(input.cashCents, false);
  const changed = input.previous !== null && input.current !== input.previous;
  const quarterEnd = ['03', '06', '09', '12'].includes(input.effectiveDate.slice(5, 7));
  const due = changed || quarterEnd;
  const total = sum([...input.positions.map((position) => position.valueCents), input.cashCents]);
  if (total < 0) throw new RangeError('Invalid rebalance denominator');
  const targets = distribute(total, STRATEGY_CATEGORIES.map((category) => BigInt(STRATEGY_TARGETS[input.current][category])));
  const rows = STRATEGY_CATEGORIES.map((category, index) => {
    const currentCents = sum(input.positions.filter((position) => position.category === category).map((position) => position.valueCents));
    return { category, currentCents, targetCents: targets[index]!,
      buyCents: due ? Math.max(0, targets[index]! - currentCents) : 0,
      sellCents: due ? Math.max(0, currentCents - targets[index]!) : 0 };
  });
  return { id: `strategy-rebalance:${input.effectiveDate}:${input.current}`, due, trigger: changed ? 'regime_changed' as const : quarterEnd ? 'quarter_end' as const : null,
    effectiveDate: input.effectiveDate, rows, executable: false as const,
    status: due ? 'requires_product_cost_and_tax_review' as const : 'not_due' as const,
    cashCents: input.cashCents, totalCents: total, monthEnd: lastDayOfMonth(input.effectiveDate.slice(0, 7)) };
}
