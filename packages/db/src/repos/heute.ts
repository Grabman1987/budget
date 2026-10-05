import {
  addDays,
  addMonths,
  changeBp,
  freeUntilPayday,
  heuteWindow,
  lastDayOfMonth,
  budgetLiquidityForecast,
  resolveParams,
  monthOf,
  netWorthDays,
  netWorthParts,
  PriceUnavailableError,
  ExchangeRateUnavailableError,
  nextPayday,
  paceForecastCurve,
  paceSources,
  paceModel,
  paymentCoverage,
  type BudgetMonth,
  type FreeEnvelope,
  type FreeUntilPayday,
  type HeutePeriod,
  type LowPoint,
  type NetWorthParts,
  type OpenOutflow,
  type PaceModel,
  type PaceSpending,
  type Payday,
} from '@budget/domain';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import {
  booking,
  bookingSplit,
  contact,
  expectedOccurrence,
  rule,
  INCOME_TYPES,
  SYSTEM_PAYEE_IDS,
} from '../schema';
import { budget as readBudget } from './queries';
import { queryBookings } from './ledger-queries';
import { cashSeries, netWorthAsOf, netWorthValuationAsOf } from './portfolio';
import { forecastInputs, loadFacts, scheduled, type RuleFacts } from './rule-inputs';
import { financeCheck, type FinanceCheck } from './rules';
import { MissingFxRateError } from './errors';
import type { Executor } from './types';
import { overviewData } from './report-ledger';

/**
 * The read model of Heute (concept §7.1, SPEC §3): one call, every figure from the domain
 * (`freeUntilPayday`, `paceModel`, `liquidityForecast`, `financeCheck`, `netWorthAsOf`). It only
 * reads. Occurrences come from the payment schedule (as for rule R07) and their status from the
 * stored occurrences; a past occurrence without a stored row counts as settled.
 */

type OccurrenceStatus = 'expected' | 'received' | 'deviating' | 'missed';

export interface HeuteOccurrence {
  /** `null` until the occurrence was materialised (`POST /api/expected/refresh`). */
  occurrenceId: string | null;
  paymentId: string;
  name: string;
  kind: 'outflow' | 'inflow';
  dueDate: string;
  status: OccurrenceStatus;
  /** Signed cents in EUR. */
  amountCents: number;
  accountId: string | null;
  accountName: string | null;
  contactName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryClass: string | null;
  /** Outflow: the envelope holds enough for it ("Rücklage voll"); inflow or no envelope: `null`. */
  covered: boolean | null;
}

export interface HeutePinned {
  id: string;
  name: string;
  icon: string | null;
  class: string | null;
  /** Verfügbar. */
  availableCents: number;
  assignedCents: number;
  /** Carry plus assigned: what the envelope may spend this month. */
  budgetedCents: number;
  /** Positive spending (refunds net). */
  spentCents: number;
  /** Where spending stands if it followed the month evenly: `budgetedCents` × day / days. */
  paceMarkCents: number;
  overspentCents: number;
}

export interface NextStep {
  kind: 'overspent' | 'uncategorized';
  urgent: boolean;
  categoryId: string | null;
  categoryName: string | null;
  /** Overspent: the amount to cover. Uncategorised: the summed amounts of the bookings. */
  cents: number;
  /** Overspent: 1. Uncategorised: the number of bookings. */
  count: number;
}

export interface HeuteLastBooking {
  id: string;
  date: string;
  payeeName: string | null;
  /** `null` for a split booking. */
  categoryName: string | null;
  categoryClass: string | null;
  memo: string | null;
  amountCents: number;
  status: string;
  accountName: string;
}

export interface HeuteUnavailable {
  unavailable: { reason: 'missing_price' | 'missing_fx'; message: string; asOf: string };
}

/** Only missing valuation inputs are isolated; unrelated failures remain errors. */
export function availableSection<T>(read: () => T): T | HeuteUnavailable {
  try {
    return read();
  } catch (error) {
    if (error instanceof PriceUnavailableError)
      return {
        unavailable: {
          reason: 'missing_price',
          asOf: error.asOf,
          message: `Ein benötigter Wertpapierkurs fehlt bis einschließlich ${error.asOf}.`,
        },
      };
    if (error instanceof MissingFxRateError || error instanceof ExchangeRateUnavailableError)
      return {
        unavailable: {
          reason: 'missing_fx',
          asOf: error.asOf,
          message: `Für ${error.currency} fehlt ein benötigter Wechselkurs bis einschließlich ${error.asOf}.`,
        },
      };
    throw error;
  }
}

export interface Heute {
  stand: {
    today: string;
    month: string;
    period: HeutePeriod;
    from: string;
    to: string;
    payday: Payday & { daysToPayday: number };
    /** Sum of the budget accounts. */
    budgetBalanceCents: number;
  };
  lead: FreeUntilPayday;
  balance: {
    /** End-of-day balance of the budget accounts from the window start up to today. */
    actual: { day: string; balanceCents: number }[];
    /** From today (the start balance) to the end of the window; empty for a past month. */
    forecast: {
      day: string;
      balanceCents: number;
      variableCents: number;
      items: { cents: number; label?: string }[];
    }[];
    /** The salary on the payday when it falls into the forecast window. */
    salary: { day: string; cents: number } | null;
    low: LowPoint | null;
  };
  pace: PaceModel & { forecast: number[]; previousMonth: string; income: number[] };
  pinned: HeutePinned[];
  upcoming14: HeuteOccurrence[];
  financeCheck:
    | {
        counts: FinanceCheck['counts'];
        keyRules: FinanceCheck['keyRules'];
      }
    | HeuteUnavailable;
  netWorth:
    | (NetWorthParts & {
        asOf: string;
        previousMonthEndCents: number;
        deltaCents: number;
        /** Change against the previous month end in basis points; `null` from 0. */
        deltaBp: number | null;
        /** The 11 previous month ends and today, oldest first. */
        series: { day: string; cents: number }[];
      })
    | HeuteUnavailable;
  lastBookings: HeuteLastBooking[];
  nextSteps: { items: NextStep[]; count: number };
}

export interface HeuteQuery {
  today: string;
  period?: HeutePeriod;
  /** `YYYY-MM`; default the month of today. */
  month?: string;
}

const UPCOMING_DAYS = 14;
const OPEN_LOOKBACK_DAYS = 31;

const roundDiv = (a: number, b: number): number => Math.floor((2 * a + b) / (2 * b));
const earliest = (a: string, b: string): string => (a < b ? a : b);
const latest = (a: string, b: string): string => (a > b ? a : b);

/** Scheduled occurrences of the budget accounts in `from..to` with their status and labels. */
export function occurrencesBetween(
  db: Executor,
  f: RuleFacts,
  from: string,
  to: string,
  today: string,
  budget: BudgetMonth | undefined,
): HeuteOccurrence[] {
  const stored = new Map(
    db
      .select()
      .from(expectedOccurrence)
      .where(
        and(
          isNull(expectedOccurrence.deletedAt),
          gte(expectedOccurrence.dueDate, from),
          lte(expectedOccurrence.dueDate, to),
        ),
      )
      .all()
      .map((o) => [`${o.expectedPaymentId}|${o.dueDate}`, o]),
  );
  const accounts = new Map(f.accounts.map((a) => [a.id, a.name]));
  const contacts = new Map(
    db
      .select()
      .from(contact)
      .all()
      .map((c) => [c.id, c.name]),
  );
  return scheduled(f, from, to, today)
    .filter((o) => o.onBudget)
    .map((o): HeuteOccurrence => {
      const row = stored.get(`${o.payment.id}|${o.dueDate}`);
      const envelope = o.category ? budget?.envelopes[o.category.id] : undefined;
      return {
        occurrenceId: row?.id ?? null,
        paymentId: o.payment.id,
        name: o.payment.name,
        kind: o.payment.kind,
        dueDate: o.dueDate,
        status: row?.status ?? (o.dueDate >= today ? 'expected' : 'received'),
        amountCents: o.cents,
        accountId: o.payment.accountId,
        accountName: o.payment.accountId ? (accounts.get(o.payment.accountId) ?? null) : null,
        contactName: o.payment.contactId ? (contacts.get(o.payment.contactId) ?? null) : null,
        categoryId: o.category?.id ?? null,
        categoryName: o.category?.name ?? null,
        categoryClass: o.category?.class ?? null,
        covered:
          o.payment.kind === 'outflow' && envelope ? envelope.availableCents >= -o.cents : null,
      };
    })
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        a.name.localeCompare(b.name) ||
        a.paymentId.localeCompare(b.paymentId),
    );
}

/**
 * What Heute offers as next steps until the inbox (P3.10) takes over: the overspent envelopes of
 * the month (most overspent first, urgent) and the uncategorised bookings on budget accounts.
 */
export function nextSteps(
  db: Executor,
  today: string,
  facts: RuleFacts = loadFacts(db, today),
): Heute['nextSteps'] {
  const month = facts.budgetByMonth.get(monthOf(today));
  const items: NextStep[] = [];
  for (const c of facts.categories) {
    const overspent = month?.envelopes[c.id]?.overspentCents ?? 0;
    if (overspent > 0)
      items.push({
        kind: 'overspent',
        urgent: true,
        categoryId: c.id,
        categoryName: c.name,
        cents: overspent,
        count: 1,
      });
  }
  items.sort(
    (a, b) => b.cents - a.cents || (a.categoryName ?? '').localeCompare(b.categoryName ?? ''),
  );

  const onBudget = new Set(facts.accounts.filter((a) => a.onBudget).map((a) => a.id));
  const uncategorized = db
    .select({ cents: bookingSplit.amountCents, accountId: booking.accountId })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .where(
      and(
        isNull(booking.deletedAt),
        isNull(booking.transferId),
        isNull(bookingSplit.transferId),
        isNull(bookingSplit.categoryId),
        isNull(bookingSplit.incomeTypeId),
        lte(booking.date, today),
      ),
    )
    .all()
    .filter((s) => onBudget.has(s.accountId));
  if (uncategorized.length > 0)
    items.push({
      kind: 'uncategorized',
      urgent: false,
      categoryId: null,
      categoryName: null,
      cents: uncategorized.reduce((a, s) => a + s.cents, 0),
      count: uncategorized.length,
    });
  return { items, count: items.reduce((a, i) => a + i.count, 0) };
}

/**
 * Pace of Bedarf and Wunsch for one month (Heute and the Monats-One-Pager): the plan is what was
 * assigned to those categories, fixed costs fall on their due day, spending comes from the
 * ledger. `occurrences` are the scheduled occurrences that cover the month.
 */
export function paceOfMonth(
  facts: RuleFacts,
  month: string,
  today: string,
  occurrences: HeuteOccurrence[],
): Heute['pace'] {
  const categories = new Map(facts.categories.map((c) => [c.id, c]));
  const monthBudget = facts.budgetByMonth.get(month);
  const budgetSet = new Set(
    facts.accounts.filter((a) => a.onBudget && a.role === 'budget').map((a) => a.id),
  );
  const paceCategory = (id: string | null) => {
    const c = id ? categories.get(id) : undefined;
    return c?.class === 'need' || c?.class === 'want';
  };
  const spendingSplits = facts.ledgerSplits.filter(
    (s) =>
      !Object.values(SYSTEM_PAYEE_IDS).some((p) => p.id === s.payeeId) &&
      paceCategory(s.categoryId) &&
      budgetSet.has(s.accountId) &&
      !(
        s.transferAccountId != null &&
        facts.accounts.some((a) => a.id === s.transferAccountId && a.onBudget)
      ) &&
      s.date >= (facts.accounts.find((a) => a.id === s.accountId)?.openingDate ?? ''),
  );
  const spending: PaceSpending[] = spendingSplits.map((s) => ({
    day: s.date,
    cents: -s.amountCents,
  }));
  const actualOf = (id: string) =>
    spendingSplits
      .filter((s) => s.categoryId === id && monthOf(s.date) === month && s.date <= today)
      .reduce((sum, s) => sum - s.amountCents, 0);
  const plannedOf = (id: string) => {
    const assigned = monthBudget?.envelopes[id]?.assignedCents ?? 0;
    const target = facts.targets
      .filter((t) => t.categoryId === id && t.validFrom <= month)
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
    return assigned > 0
      ? assigned
      : Math.max(
          0,
          target?.kind === 'monthly' && target.everyMonths === 1 ? target.amountCents : 0,
        );
  };
  const { fixed, fixedSpentCents, limitCents } = paceSources(
    month,
    today,
    facts.categories
      .filter((c) => paceCategory(c.id))
      .map((c) => ({
        kind: c.kind,
        planCents: plannedOf(c.id),
        actualCents: actualOf(c.id),
        dueDay:
          facts.targets
            .filter((t) => t.categoryId === c.id && t.validFrom <= month)
            .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0]?.dueDay ?? null,
        scheduled: occurrences
          .filter(
            (o) =>
              o.kind === 'outflow' &&
              monthOf(o.dueDate) === month &&
              o.categoryId === c.id &&
              o.status !== 'missed',
          )
          .map((o) => ({
            day: o.dueDate,
            cents: -o.amountCents,
            settled: o.status === 'received' || o.status === 'deviating',
          })),
      })),
  );
  const model = paceModel({
    month,
    today,
    limitCents,
    fixedSpentCents,
    fixed,
    spending: spending.filter((s) => monthOf(s.day) === month),
    previousSpending: spending.filter((s) => monthOf(s.day) === addMonths(month, -1)),
  });
  const incomes = overviewData(facts.db).splits.filter(
    (s) =>
      s.kind === 'income' &&
      s.incomeGroup === 'household' &&
      monthOf(s.date) === month &&
      s.date <= today,
  );
  return {
    ...model,
    income: model.actual.map((_, day) =>
      incomes
        .filter((s) => Number(s.date.slice(8)) <= day)
        .reduce((sum, s) => sum + s.amountCents, 0),
    ),
    forecast: paceForecastCurve(model, fixed),
    previousMonth: addMonths(month, -1),
  };
}

export function heute(db: Executor, query: HeuteQuery): Heute {
  const today = query.today;
  const month = query.month ?? monthOf(today);
  const facts = loadFacts(db, latest(lastDayOfMonth(month), today));
  const todayBudget = facts.budgetByMonth.get(monthOf(today));
  const monthBudget = facts.budgetByMonth.get(month);
  const categories = new Map(facts.categories.map((c) => [c.id, c]));
  const budgetAccounts = facts.accounts.filter((a) => a.onBudget && a.role === 'budget');
  const budgetIds = budgetAccounts.map((a) => a.id);
  const valuation = netWorthValuationAsOf(db, today);
  // Forecast only consumes budget accounts; an unknown depot cannot block daily cash planning.
  const budgetValues = Object.fromEntries(
    budgetIds.map((id) => {
      const value = valuation.byAccount[id] ?? (Object.hasOwn(valuation.byAccount, id) ? null : 0);
      if (value === null) {
        const currency = valuation.missingFxByAccount[id]?.[0];
        if (currency) throw new MissingFxRateError(currency, today);
        throw new PriceUnavailableError(id, valuation.missingPriceByAccount[id]![0]!, today);
      }
      return [id, value];
    }),
  );
  const sumBudget = (balanceOf: (id: string) => number) =>
    budgetIds.reduce((s, id) => s + balanceOf(id), 0);

  // ---- occurrences, payday, window ----
  const all = occurrencesBetween(
    db,
    facts,
    earliest(`${month}-01`, addDays(today, -OPEN_LOOKBACK_DAYS)),
    latest(lastDayOfMonth(month), addDays(today, 400)),
    today,
    todayBudget,
  );
  const isSalary = (paymentId: string) =>
    facts.payments.find((p) => p.id === paymentId)?.incomeTypeId === INCOME_TYPES.salary.id;
  const salary = all.filter(
    (o) => o.kind === 'inflow' && o.status === 'expected' && isSalary(o.paymentId),
  );
  const payday = nextPayday(today);
  const window = heuteWindow(query.period ?? 'month', month, today, payday.day);

  // ---- lead: free until payday ----
  const envelopes: FreeEnvelope[] = [];
  for (const c of facts.categories) {
    if (c.class !== 'need' && c.class !== 'want') continue;
    envelopes.push({
      id: c.id,
      name: c.name,
      class: c.class,
      availableCents: todayBudget?.envelopes[c.id]?.availableCents ?? 0,
    });
  }
  // Open = still expected, not covered by a Zukunft envelope (those are transfers, not spending).
  const openOutflows: OpenOutflow[] = all
    .filter((o) => o.kind === 'outflow' && o.status === 'expected' && o.categoryClass !== 'future')
    .map((o) => ({
      id: o.occurrenceId ?? `${o.paymentId}|${o.dueDate}`,
      label: o.name,
      day: o.dueDate,
      cents: -o.amountCents,
    }));
  const lead = freeUntilPayday({ envelopes, openOutflows, payday: payday.day, today });

  // ---- balance: actual up to today, forecast after ----
  const actualDays: string[] = [];
  for (let d = window.from; d <= window.to && d <= today; d = addDays(d, 1)) actualDays.push(d);
  const series = cashSeries(db, actualDays, budgetIds);
  const actual = actualDays.map((day, i) => ({
    day,
    balanceCents: sumBudget((id) => series.get(id)?.[i] ?? 0),
  }));
  let forecast: Heute['balance']['forecast'] = [];
  let salaryJump: Heute['balance']['salary'] = null;
  let low: LowPoint | null = null;
  if (window.to > today && budgetAccounts.length > 0) {
    const inputs = forecastInputs(facts, today, { byAccount: budgetValues });
    const r07 = db.select().from(rule).where(eq(rule.code, 'R07')).get();
    const horizon = Number(
      resolveParams('R07', JSON.parse(r07?.paramsJson ?? '{}'))['horizonDays'],
    );
    const run = budgetLiquidityForecast(inputs, horizon);
    forecast = run.days.map((d) => ({
      day: d.day,
      balanceCents: d.balanceCents,
      variableCents: d.variableCents,
      items: d.items,
    }));
    low = run.low;
    // A planning boundary must never invent or move a salary receipt in the cash forecast.
    const salaryDay = salary.find(
      (o) => o.dueDate > today && o.dueDate <= run.days.at(-1)!.day,
    )?.dueDate;
    if (salaryDay) {
      const jump = salary.filter((o) => o.dueDate === salaryDay);
      salaryJump = { day: salaryDay, cents: jump.reduce((a, o) => a + o.amountCents, 0) };
    }
  } else if (actual.length > 0) {
    const min = actual.reduce((a, b) => (b.balanceCents < a.balanceCents ? b : a));
    low = { day: min.day, index: actualDays.indexOf(min.day), cents: min.balanceCents };
  }

  // ---- pace of Bedarf and Wunsch ----
  const {
    forecast: paceForecast,
    previousMonth: paceMonthBefore,
    ...model
  } = paceOfMonth(facts, month, today, all);

  // ---- pinned envelopes, in the order they were pinned ----
  const pinned: HeutePinned[] = facts.categories
    .filter((c) => c.pinnedAt !== null)
    .sort(
      (a, b) =>
        (a.pinnedAt as string).localeCompare(b.pinnedAt as string) || a.name.localeCompare(b.name),
    )
    .map((c) => {
      const e = monthBudget?.envelopes[c.id];
      const budgetedCents = (e?.carryCents ?? 0) + (e?.assignedCents ?? 0);
      return {
        id: c.id,
        name: c.name,
        icon: c.icon,
        class: c.class,
        availableCents: e?.availableCents ?? 0,
        assignedCents: e?.assignedCents ?? 0,
        budgetedCents,
        spentCents: -(e?.activityCents ?? 0),
        paceMarkCents: roundDiv(Math.max(0, budgetedCents) * model.todayDay, model.daysInMonth),
        overspentCents: e?.overspentCents ?? 0,
      };
    });

  // ---- upcoming, Finanz-Check, net worth, bookings, next steps ----
  const upcomingRows = all.filter(
    (o) => o.dueDate >= today && o.dueDate <= addDays(today, UPCOMING_DAYS),
  );
  const upcomingMonths = [...new Set(upcomingRows.map((o) => monthOf(o.dueDate)))];
  const available = Object.fromEntries(
    readBudget(db, upcomingMonths).map((m) => [
      m.month,
      Object.fromEntries(Object.entries(m.envelopes).map(([id, e]) => [id, e.availableCents])),
    ]),
  );
  const upcoming14 = paymentCoverage(upcomingRows, available);
  const check = availableSection(() => {
    const result = financeCheck(db, today, facts);
    return { counts: result.counts, keyRules: result.keyRules };
  });
  const netWorth = availableSection(() => {
    const nw = netWorthAsOf(db, today);

    const roles = new Map(facts.accounts.map((a) => [a.id, a.role]));
    const parts = netWorthParts(
      Object.entries(nw.byAccount).flatMap(([id, valueCents]) => {
        const role = roles.get(id);
        return role ? [{ role, valueCents }] : [];
      }),
    );
    const nwSeries = netWorthDays(today).map((day) => ({
      day,
      cents: day === today ? nw.totalCents : netWorthAsOf(db, day).totalCents,
    }));
    const previousMonthEndCents = nwSeries[nwSeries.length - 2]?.cents ?? nw.totalCents;

    return {
      ...parts,
      asOf: today,
      previousMonthEndCents,
      deltaCents: nw.totalCents - previousMonthEndCents,
      deltaBp: changeBp(nw.totalCents, previousMonthEndCents),
      series: nwSeries,
    };
  });

  const lastBookings: HeuteLastBooking[] = queryBookings(db, { limit: 5, to: today }).items.map(
    (b) => {
      const first = b.splits[0];
      const single = b.splits.length === 1 ? first : undefined;
      const categoryId = single?.categoryId ?? null;
      return {
        id: b.id,
        date: b.date,
        payeeName: b.payeeName,
        categoryName: single?.categoryName ?? null,
        categoryClass: (categoryId ? categories.get(categoryId)?.class : null) ?? null,
        memo: b.memo ?? first?.memo ?? null,
        amountCents: b.amountCents,
        status: b.status,
        accountName: b.accountName,
      };
    },
  );

  return {
    stand: {
      today,
      month,
      period: window.period,
      from: window.from,
      to: window.to,
      payday: { ...payday, daysToPayday: lead.daysToPayday },
      budgetBalanceCents: sumBudget((id) => budgetValues[id] ?? 0),
    },
    lead,
    balance: { actual, forecast, salary: salaryJump, low },
    pace: { ...model, forecast: paceForecast, previousMonth: paceMonthBefore },
    pinned,
    upcoming14,
    financeCheck: check,
    netWorth,
    lastBookings,
    nextSteps: nextSteps(db, today, facts),
  };
}
