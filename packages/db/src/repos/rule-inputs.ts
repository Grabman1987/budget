import { toWealthPositions } from './portfolio-summary';
import { resolvePortfolioRiskPolicy } from './portfolio-risk-policy';
import { bookInputs } from './book-inputs';
import {
  addDays,
  addMonths,
  averageCents,
  BOOK_RULE_CODES,
  freedomProgressBp,
  freedomTargetCents,
  lastDayOfMonth,
  monthlyEquivalent,
  monthOf,
  monthsBetween,
  occurrences,
  plannedEventOccurrences,
  targetNeed,
  todayInVienna,
  toEurCents,
  contractVersionOn,
  versionOn,
  yearlyEquivalent,
  type AllocMonth,
  type AssignmentEvent,
  type BudgetMonth,
  type CardBalance,
  type CategoryTarget,
  type DebtLoan,
  type ForecastItem,
  type MoneyEvent,
  type MonthFlow,
  type RuleInputs,
  type SinkingFund,
  type Rhythm,
} from '@budget/domain';
import { and, asc, eq, isNull } from 'drizzle-orm';
import {
  account,
  assetClass,
  auditLog,
  booking,
  bookingSplit,
  category,
  categoryTarget,
  envelopeMonth,
  expectedPayment,
  expectedPaymentVersion,
  INCOME_TYPES,
  institution,
  plannedEvent,
  security,
  rule,
} from '../schema';
import { allocationMonth, isIncomeCategorySplit } from './allocation';
import { scheduleVersion, schedulePayment } from './expected';
import { holdingValuesAsOf, netWorthAsOf, type NetWorth } from './portfolio';
import { fxRateOnOrBefore } from './prices';
import { budgetLedger, budgetOfLedger } from './queries';
import type { Executor } from './types';
import { freedomExpenses, freedomInvestedCents } from './freedom-inputs';

/**
 * `ruleInputs` is the single place that assembles what the rules read (SPEC §4): the budget
 * months, the 50/30/20 read model, scheduled payments, the liquidity forecast items, the
 * positions with their kind and platform, and the account terms. It only reads; the engine in
 * `@budget/domain` decides. Loading is split in two: `loadFacts` reads what does not depend on
 * the day once, `ruleInputs` narrows it to one day, so evaluating a day and twelve month ends
 * stays cheap.
 */

type AccountRow = typeof account.$inferSelect;
type CategoryRow = typeof category.$inferSelect;
type PaymentRow = typeof expectedPayment.$inferSelect;
type VersionRow = typeof expectedPaymentVersion.$inferSelect;

interface IncomeSplit {
  /** Cash (booking) date: rules about paydays and windfalls keep reading this. */
  day: string;
  /** Decision 42: budget income of this booking is assigned to the following month. */
  incomeNextMonth: boolean;
  cents: number;
  incomeTypeId: string;
}

/** What does not depend on the evaluated day. */
export interface RuleFacts {
  accounts: AccountRow[];
  categories: CategoryRow[];
  targets: (typeof categoryTarget.$inferSelect)[];
  payments: PaymentRow[];
  versions: Map<string, VersionRow[]>;
  plannedEvents: (typeof plannedEvent.$inferSelect)[];
  securities: Map<string, typeof security.$inferSelect>;
  classNames: Record<string, string>;
  platformNames: Record<string, string>;
  incomeSplits: IncomeSplit[];
  ledgerSplits: ReturnType<typeof budgetLedger>['splits'];
  /** Assigned per (category, month) with the audit deltas summed per day. */
  assignedRows: { categoryId: string; month: string; cents: number }[];
  assignmentAudit: { categoryId: string; month: string; day: string; cents: number }[];
  budgetByMonth: Map<string, BudgetMonth>;
  allocByMonth: Map<string, AllocMonth>;
  firstMonth: string;
  db: Executor;
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

function auditDeltas(db: Executor): RuleFacts['assignmentAudit'] {
  const rows = db
    .select()
    .from(auditLog)
    .where(eq(auditLog.entityType, 'envelope_month'))
    .orderBy(asc(auditLog.ts))
    .all();
  const out: RuleFacts['assignmentAudit'] = [];
  for (const r of rows) {
    const before = r.beforeJson ? (JSON.parse(r.beforeJson) as Record<string, unknown>) : null;
    const after = r.afterJson ? (JSON.parse(r.afterJson) as Record<string, unknown>) : null;
    const key = r.entityId.split(':');
    const categoryId = key[0];
    const month = key[1];
    if (!categoryId || !month) continue;
    const delta = num(after?.['assigned_cents']) - num(before?.['assigned_cents']);
    if (delta !== 0)
      out.push({ categoryId, month, day: todayInVienna(new Date(r.ts)), cents: delta });
  }
  return out;
}

/**
 * Reads the facts that hold for every day up to `upTo`. A caller that read the budget ledger
 * already passes it in (one read per request instead of one per budget).
 */
export function loadFacts(
  db: Executor,
  upTo: string,
  ledger: ReturnType<typeof budgetLedger> = budgetLedger(db),
): RuleFacts {
  const accounts = db.select().from(account).where(isNull(account.deletedAt)).all();
  const categories = db.select().from(category).where(isNull(category.deletedAt)).all();
  const budgetStarts = accounts.filter((a) => a.onBudget).map((a) => monthOf(a.openingDate));
  const firstMonth = budgetStarts.reduce((a, m) => (m < a ? m : a), monthOf(upTo));
  const budgetByMonth = new Map<string, BudgetMonth>();
  if (budgetStarts.length > 0)
    for (const m of budgetOfLedger(ledger, monthsBetween(firstMonth, monthOf(upTo))))
      budgetByMonth.set(m.month, m);

  const versions = new Map<string, VersionRow[]>();
  for (const v of db
    .select()
    .from(expectedPaymentVersion)
    .where(isNull(expectedPaymentVersion.deletedAt))
    .orderBy(asc(expectedPaymentVersion.validFrom))
    .all())
    versions.set(v.expectedPaymentId, [...(versions.get(v.expectedPaymentId) ?? []), v]);

  const categoryKindById = new Map(categories.map((c) => [c.id, c.kind]));
  const incomeSplits = db
    .select({
      day: booking.date,
      incomeNextMonth: booking.incomeNextMonth,
      cents: bookingSplit.amountCents,
      incomeTypeId: bookingSplit.incomeTypeId,
      categoryId: bookingSplit.categoryId,
    })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .innerJoin(account, eq(account.id, booking.accountId))
    .where(
      and(
        isNull(booking.deletedAt),
        isNull(account.deletedAt),
        eq(account.onBudget, true),
        isNull(booking.transferId),
        isNull(bookingSplit.transferId),
      ),
    )
    .all()
    .flatMap((s) => {
      const kind = s.categoryId === null ? null : (categoryKindById.get(s.categoryId) ?? null);
      return isIncomeCategorySplit(s.categoryId, kind) && s.incomeTypeId !== null && s.cents > 0
        ? [
            {
              day: s.day,
              incomeNextMonth: s.incomeNextMonth,
              cents: s.cents,
              incomeTypeId: s.incomeTypeId,
            },
          ]
        : [];
    });

  return {
    accounts,
    categories,
    targets: db.select().from(categoryTarget).where(isNull(categoryTarget.deletedAt)).all(),
    payments: db.select().from(expectedPayment).where(isNull(expectedPayment.deletedAt)).all(),
    versions,
    plannedEvents: db
      .select()
      .from(plannedEvent)
      .where(and(isNull(plannedEvent.deletedAt), eq(plannedEvent.enabled, true)))
      .all(),
    securities: new Map(
      db
        .select()
        .from(security)
        .where(isNull(security.deletedAt))
        .all()
        .map((s) => [s.id, s]),
    ),
    classNames: Object.fromEntries(
      db
        .select()
        .from(assetClass)
        .where(isNull(assetClass.deletedAt))
        .all()
        .map((c) => [c.id, c.name]),
    ),
    platformNames: Object.fromEntries(
      db
        .select()
        .from(institution)
        .where(isNull(institution.deletedAt))
        .all()
        .map((i) => [i.id, i.name]),
    ),
    incomeSplits,
    ledgerSplits: ledger.splits,
    assignedRows: db
      .select()
      .from(envelopeMonth)
      .where(isNull(envelopeMonth.deletedAt))
      .all()
      .map((r) => ({ categoryId: r.categoryId, month: r.month, cents: r.assignedCents })),
    assignmentAudit: auditDeltas(db),
    budgetByMonth,
    allocByMonth: new Map(),
    firstMonth,
    db,
  };
}

// ---- helpers over the facts ----

const catById = (f: RuleFacts) => new Map(f.categories.map((c) => [c.id, c]));

/** Spending of a month in the categories picked by `pick`, positive cents (refunds net). */
function spent(f: RuleFacts, month: string, pick: (c: CategoryRow) => boolean): number {
  const envelopes = f.budgetByMonth.get(month)?.envelopes ?? {};
  let total = 0;
  for (const c of f.categories) if (pick(c)) total -= envelopes[c.id]?.activityCents ?? 0;
  return total;
}

function allocOf(f: RuleFacts, month: string): AllocMonth | null {
  const cached = f.allocByMonth.get(month);
  if (cached) return cached;
  const envelopes = f.budgetByMonth.get(month)?.envelopes;
  if (!envelopes) return null;
  const alloc = allocationMonth(f.db, month, envelopes);
  f.allocByMonth.set(month, alloc);
  return alloc;
}

const netIncomeOf = (a: AllocMonth): number => a.incomeCents + Math.round(a.annualIncomeCents / 12);

/** The target of a category valid in `month` (latest `valid_from` not after it). */
function targetOf(f: RuleFacts, categoryId: string, month: string): CategoryTarget | null {
  const hit = f.targets
    .filter((t) => t.categoryId === categoryId && t.validFrom <= month)
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
  return hit
    ? {
        kind: hit.kind,
        amountCents: hit.amountCents,
        everyMonths: hit.everyMonths,
        targetDate: hit.targetDate,
      }
    : null;
}

/** Scheduled occurrences (EUR cents) of the live payments between two days, both included. */
export function scheduled(f: RuleFacts, from: string, to: string, asOf: string) {
  const out: {
    payment: PaymentRow;
    dueDate: string;
    cents: number;
    onBudget: boolean;
    category: CategoryRow | undefined;
  }[] = [];
  const cats = catById(f);
  const accounts = new Map(f.accounts.map((a) => [a.id, a]));
  for (const p of f.payments) {
    const versions = f.versions.get(p.id) ?? [];
    for (const occ of occurrences(schedulePayment(p), versions.map(scheduleVersion), from, to)) {
      const v = versionOn(versions, occ.dueDate);
      let cents = occ.amountCents;
      if (v && v.currency !== 'EUR') {
        const rate = fxRateOnOrBefore(f.db, v.currency, asOf);
        if (!rate) continue;
        cents = toEurCents(cents, rate.rateMicro);
      }
      const acct = p.accountId ? accounts.get(p.accountId) : undefined;
      out.push({
        payment: p,
        dueDate: occ.dueDate,
        cents,
        onBudget: acct ? acct.onBudget && acct.role === 'budget' : true,
        category: p.categoryId ? cats.get(p.categoryId) : undefined,
      });
    }
  }
  return out;
}

/** One occurrence's amount of a payment in force on `day` (EUR cents, positive), or 0. */
function unitAmount(f: RuleFacts, p: PaymentRow, day: string): number {
  // Same valuation as report 2.3: a payment whose first due date is ahead counts from setup.
  const v = contractVersionOn(
    { rhythm: p.rhythm as Rhythm, startDate: p.startDate, endDate: p.endDate },
    f.versions.get(p.id) ?? [],
    day,
  );
  if (!v) return 0;
  if (v.currency === 'EUR') return v.amountCents;
  const rate = fxRateOnOrBefore(f.db, v.currency, day);
  return rate ? toEurCents(v.amountCents, rate.rateMicro) : 0;
}

const monthlyAmount = (f: RuleFacts, p: PaymentRow, day: string): number =>
  monthlyEquivalent(p.rhythm as Rhythm, unitAmount(f, p, day));
const yearlyAmount = (f: RuleFacts, p: PaymentRow, day: string): number =>
  yearlyEquivalent(p.rhythm as Rhythm, unitAmount(f, p, day));

// ---- the inputs ----

/** Last full month: the month itself when `asOf` is its last day. */
export function referenceMonth(asOf: string): string {
  const month = monthOf(asOf);
  return asOf === lastDayOfMonth(month) ? month : addMonths(month, -1);
}

/**
 * The liquidity forecast inputs of the budget accounts on `asOf` (rule R07 and the Heute chart):
 * start balance, scheduled payments and planned events of the next 365 days, and the planned
 * variable spending per month.
 */
export function forecastInputs(
  f: RuleFacts,
  asOf: string,
  nw: Pick<NetWorth, 'byAccount'>,
): NonNullable<RuleInputs['forecast']> {
  const cur = monthOf(asOf);
  const ref = referenceMonth(asOf);
  const budgetAccounts = f.accounts.filter(
    (a) => a.openingDate <= asOf && a.onBudget && a.role === 'budget',
  );
  const to = addDays(asOf, 365);
  const items: ForecastItem[] = [
    ...scheduled(f, addDays(asOf, 1), to, asOf)
      .filter((o) => o.onBudget)
      .map((o) => ({
        day: o.dueDate,
        cents: o.cents,
        kind: o.cents >= 0 ? ('income' as const) : ('fixed' as const),
        label: o.payment.name,
        ...(o.category?.class ? { group: o.category.class } : {}),
      })),
    ...f.plannedEvents
      .filter((e) => {
        const a = e.accountId ? f.accounts.find((x) => x.id === e.accountId) : undefined;
        return (
          e.enabled &&
          (e.accountId === null ||
            (a &&
              a.onBudget &&
              a.role === 'budget' &&
              a.openingDate <= asOf &&
              a.currency === 'EUR'))
        );
      })
      .flatMap((e) => plannedEventOccurrences(e, addDays(asOf, 1), to))
      .map((e) => ({ day: e.date, cents: e.amountCents, kind: 'event' as const, label: e.name })),
  ];
  const last3 = monthsBetween(addMonths(ref, -2), ref);
  // The plan: the monthly targets of the variable envelopes; without targets the last 3 months.
  const planned = f.categories
    .filter((c) => c.kind === 'variable')
    .reduce((sum, c) => {
      const t = targetOf(f, c.id, cur);
      return sum + (t && t.kind === 'monthly' ? t.amountCents : 0);
    }, 0);
  const variableMonthlyCents =
    planned > 0
      ? planned
      : Math.max(0, averageCents(last3.map((m) => spent(f, m, (c) => c.kind === 'variable'))));
  return {
    startDay: asOf,
    startCents: budgetAccounts.reduce((s, a) => s + (nw.byAccount[a.id] ?? 0), 0),
    items,
    variableMonthlyCents,
    overdraftLimitCents: budgetAccounts.reduce((s, a) => s + (a.overdraftLimitCents ?? 0), 0),
  };
}

export function ruleInputs(
  db: Executor,
  asOf: string,
  facts?: RuleFacts,
  includeBooks = true,
): RuleInputs {
  const f = facts ?? loadFacts(db, asOf);
  const cur = monthOf(asOf);
  const ref = referenceMonth(asOf);
  const hasBudget = f.budgetByMonth.has(cur) || f.budgetByMonth.has(ref);
  const nw = netWorthAsOf(db, asOf);
  const live = (a: AccountRow) => a.openingDate <= asOf;
  const accounts = f.accounts.filter(live);
  const cats = catById(f);
  const window12 = monthsBetween(addMonths(ref, -11), ref);

  // R01, R08, R10, R11
  const allocByMonth: Record<string, AllocMonth> = {};
  for (const m of window12) {
    const a = allocOf(f, m);
    if (a) allocByMonth[m] = a;
  }
  const refAlloc = allocOf(f, ref);
  const netIncome = refAlloc ? netIncomeOf(refAlloc) : null;

  // R02
  const emergency = hasBudget
    ? {
        reserveCents: accounts
          .filter((a) => a.role === 'reserve')
          .reduce((s, a) => s + (nw.byAccount[a.id] ?? 0), 0),
        needSpending: monthsBetween(addMonths(ref, -11), ref).map((month) => ({
          month,
          cents: spent(f, month, (c) => c.class === 'need'),
        })),
        firstMonth: f.firstMonth,
      }
    : null;

  // R03: spending and income of the budget accounts; transfers between them are no events
  const onBudget = new Set(accounts.filter((a) => a.onBudget).map((a) => a.id));
  const moneyEvents: MoneyEvent[] = [
    ...accounts
      .filter((a) => a.onBudget && a.openingBalanceCents > 0)
      .map((a) => ({ day: a.openingDate, cents: a.openingBalanceCents })),
    ...f.ledgerSplits
      .filter(
        (s) =>
          s.date <= asOf &&
          onBudget.has(s.accountId) &&
          !(s.transferAccountId != null && onBudget.has(s.transferAccountId)),
      )
      .map((s) => ({ day: s.date, cents: s.amountCents })),
  ];

  // R04: the Zukunft envelopes against the salary days
  const since = `${addMonths(cur, -11)}-01`;
  const salaryDays = [
    ...new Set(
      f.incomeSplits
        .filter((s) => s.incomeTypeId === INCOME_TYPES.salary.id && s.day >= since && s.day <= asOf)
        .map((s) => s.day),
    ),
  ].sort();
  const futureIds = new Set(f.categories.filter((c) => c.class === 'future').map((c) => c.id));
  const assignments: AssignmentEvent[] = [];
  for (const salaryDay of salaryDays) {
    const month = monthOf(salaryDay);
    for (const row of f.assignedRows.filter(
      (r) => r.month === month && futureIds.has(r.categoryId),
    )) {
      const events = f.assignmentAudit.filter(
        (e) => e.categoryId === row.categoryId && e.month === month,
      );
      for (const e of events)
        assignments.push({
          day: e.day < salaryDay ? salaryDay : e.day,
          class: 'future',
          amountCents: e.cents,
        });
      const rest = row.cents - events.reduce((s, e) => s + e.cents, 0);
      // Without a change log the month's assignment counts as made on the salary day.
      if (rest !== 0) assignments.push({ day: salaryDay, class: 'future', amountCents: rest });
    }
  }
  const curEnvelopes = f.budgetByMonth.get(cur)?.envelopes ?? {};
  let zukunftTarget = 0;
  for (const c of f.categories) {
    if (c.class !== 'future') continue;
    const target = targetOf(f, c.id, cur);
    const env = curEnvelopes[c.id];
    if (target && env)
      zukunftTarget += targetNeed(target, {
        month: cur,
        carryCents: env.carryCents,
        assignedCents: 0,
        refill: false,
      }).goalCents;
  }
  const payYourself =
    salaryDays.length > 0 ? { salaryDays, assignments, targetCents: zukunftTarget } : null;

  // R05, R06
  const sinkingFunds: SinkingFund[] = f.categories.flatMap((c) => {
    const target = targetOf(f, c.id, cur);
    const env = curEnvelopes[c.id];
    if (c.kind !== 'periodic' || !target || !env) return [];
    return [
      {
        id: c.id,
        target,
        envelope: {
          month: cur,
          carryCents: env.carryCents,
          assignedCents: env.assignedCents,
          refill: false,
        },
      },
    ];
  });
  const balances = new Map(accounts.map((a) => [a.id, nw.byAccount[a.id] ?? 0] as const));
  const cards: CardBalance[] = f.categories.flatMap((c) => {
    if (c.kind !== 'card_payment' || !c.cardAccountId) return [];
    const balance = balances.get(c.cardAccountId);
    if (balance === undefined) return [];
    return [
      {
        id: c.cardAccountId,
        owedCents: Math.max(0, -balance),
        availableCents: curEnvelopes[c.id]?.availableCents ?? 0,
      },
    ];
  });

  const forecast = hasBudget ? forecastInputs(f, asOf, nw) : null;

  // R08, R10: contractual payments in force
  const outflows = f.payments.filter((p) => p.kind === 'outflow');
  // Debt categories in waterfall stage 1 are the contractual minimum rate; later stages are
  // extra repayments (Sondertilgung).
  const isMinimumDebt = (c: CategoryRow | undefined) => c?.kind === 'debt' && (c.stage ?? 1) === 1;
  const isDebt = (p: PaymentRow) => (p.categoryId ? isMinimumDebt(cats.get(p.categoryId)) : false);
  const kindOf = (p: PaymentRow) => (p.categoryId ? cats.get(p.categoryId)?.kind : undefined);
  const debtAccounts = accounts.filter(
    (a) =>
      a.closedAt === null &&
      (a.type === 'loan' ||
        a.role === 'debt' ||
        (a.type === 'credit_card' &&
          cards.some((c) => c.id === a.id && c.owedCents > c.availableCents))) &&
      (nw.byAccount[a.id] ?? 0) < 0,
  );
  const debtIds = new Set(debtAccounts.map((a) => a.id));
  const scheduledDebt = outflows.filter(isDebt).reduce((s, p) => s + monthlyAmount(f, p, asOf), 0);
  // Historical principal repayments to debt accounts are a lower bound, not another schedule.
  const recordedDebt = f.ledgerSplits
    .filter(
      (s) =>
        monthOf(s.date) === ref &&
        s.transferAccountId != null &&
        debtIds.has(s.transferAccountId) &&
        s.categoryId != null &&
        isMinimumDebt(cats.get(s.categoryId)) &&
        s.amountCents < 0 &&
        onBudget.has(s.accountId),
    )
    .reduce((sum, s) => sum - s.amountCents, 0);
  const knownDebtPayment = scheduledDebt > 0 ? scheduledDebt : recordedDebt;
  const loanPaymentsMonthlyCents =
    debtAccounts.length > 0 && knownDebtPayment === 0 ? null : knownDebtPayment;
  const fixedCosts =
    outflows.length > 0
      ? {
          fixedMonthlyCents: outflows
            .filter((p) => kindOf(p) === 'fixed' || isDebt(p))
            .reduce((s, p) => s + monthlyAmount(f, p, asOf), 0),
          periodicAnnualCents: outflows
            .filter((p) => kindOf(p) === 'periodic')
            .reduce((s, p) => s + yearlyAmount(f, p, asOf), 0),
        }
      : null;

  // R09
  const loans: (DebtLoan & { name: string })[] = accounts
    .filter((a) => a.type === 'loan' && a.closedAt === null)
    .map((a) => ({
      id: a.id,
      name: a.name,
      rateBp: a.interestRateBp ?? 0,
      balanceCents: Math.max(0, -(nw.byAccount[a.id] ?? 0)),
    }));
  const debt = {
    loans,
    extraRepayments: window12.concat(cur === ref ? [] : [cur]).map((month) => ({
      month,
      cents: Math.max(
        0,
        spent(f, month, (c) => c.kind === 'debt' && !isMinimumDebt(c)),
      ),
    })),
    investingAssignedCents: f.categories
      .filter((c) => c.kind === 'invest')
      .reduce((s, c) => s + Math.max(0, curEnvelopes[c.id]?.assignedCents ?? 0), 0),
  };

  // R11: 24 full months of income and consumption
  const flows: MonthFlow[] = [];
  for (const month of monthsBetween(addMonths(ref, -23), ref)) {
    const a = allocOf(f, month);
    if (!a) continue;
    flows.push({
      month,
      incomeCents: netIncomeOf(a),
      spendingCents: spent(f, month, (c) => c.class === 'need' || c.class === 'want'),
    });
  }

  // R12: special payments (Sonderzahlung, Geschenk) and what is left in "Zu verteilen"
  const windfallTypes = new Set<string>([INCOME_TYPES.special.id, INCOME_TYPES.gift.id]);
  const windfall = monthsBetween(addMonths(cur, -11), cur).flatMap((month) => {
    const splits = f.incomeSplits.filter((s) => monthOf(s.day) === month && s.day <= asOf);
    const wind = splits.filter((s) => windfallTypes.has(s.incomeTypeId));
    const windfallCents = wind.reduce((s, x) => s + x.cents, 0);
    if (windfallCents === 0) return [];
    const lastDay = wind.reduce((d, s) => (s.day > d ? s.day : d), '');
    // Income that arrived after the windfall (the salary at month end) cannot be distributed yet.
    const laterIncome = splits.filter((s) => s.day > lastDay).reduce((a, s) => a + s.cents, 0);
    const bm = f.budgetByMonth.get(month);
    return [
      {
        month,
        windfallCents,
        undistributedCents: Math.min(
          windfallCents,
          Math.max(0, (bm?.toBeAssignedCents ?? 0) - laterIncome),
        ),
        assignedByCategory: Object.fromEntries(
          Object.entries(bm?.envelopes ?? {}).map(([id, e]) => [id, e.assignedCents]),
        ),
      },
    ];
  });

  // R13 to R15: positions valued on the day; platform ownership comes from the holding account.
  const institutionByAccount = new Map(accounts.map((a) => [a.id, a.institutionId]));
  const positions = toWealthPositions(
    db,
    asOf,
    holdingValuesAsOf(db, asOf).flatMap((h) => {
      const s = f.securities.get(h.securityId);
      return s
        ? [
            {
              securityId: s.id,
              kind: s.kind,
              assetClassId: null,
              accounts: [
                {
                  accountId: h.accountId,
                  institutionId: institutionByAccount.get(h.accountId) ?? null,
                  valueCents: h.valueCents,
                },
              ],
            },
          ]
        : [];
    }),
  );
  const portfolioRiskPolicy = resolvePortfolioRiskPolicy(db, asOf);
  const classTargets = portfolioRiskPolicy.targets;

  // R16: invested wealth over 25 annual spends, now and three months ago
  const progressAt = (day: string, refM: string): { invested: number; spend: number } => {
    const worth = day === asOf ? nw : netWorthAsOf(db, day);
    const invested = freedomInvestedCents(f.accounts, day, worth.byAccount);
    if (invested === null) throw new RangeError('Freedom investment total unavailable');
    return {
      invested,
      spend: freedomExpenses(f, refM),
    };
  };
  const nowP = progressAt(asOf, ref);
  const prevRef = addMonths(ref, -3);
  const prevDay = lastDayOfMonth(prevRef);
  const prevP =
    f.budgetByMonth.has(prevRef) && prevDay >= f.firstMonth ? progressAt(prevDay, prevRef) : null;
  const freedom = hasBudget
    ? {
        investedCents: nowP.invested,
        annualSpendCents: nowP.spend,
        previousProgressBp:
          prevP && prevP.spend > 0
            ? freedomProgressBp(prevP.invested, freedomTargetCents(prevP.spend))
            : null,
      }
    : null;

  return {
    asOf,
    ...(includeBooks ||
    db
      .select()
      .from(rule)
      .all()
      .some((r) => r.enabled && BOOK_RULE_CODES.some((code) => code === r.code))
      ? { books: bookInputs(f, asOf, ref, nw, includeBooks) }
      : {}),
    refMonth: ref,
    allocByMonth: Object.keys(allocByMonth).length > 0 ? allocByMonth : null,
    emergency,
    moneyEvents,
    payYourself,
    sinkingFunds,
    cards,
    forecast,
    netIncomeMonthlyCents: netIncome !== null && netIncome > 0 ? netIncome : null,
    loanPaymentsMonthlyCents,
    fixedCosts,
    debt,
    flows,
    windfall,
    positions,
    classTargets,
    portfolioRiskPolicy,
    names: {
      assetClasses: f.classNames,
      securities: Object.fromEntries([...f.securities.values()].map((s) => [s.id, s.name])),
      platforms: f.platformNames,
    },
    freedom,
  };
}
