import { isLiquidityAccount } from './liquidity-account';
import { readPaymentLifecycles, type PaymentLifecycle } from './expected-lifecycle-invariants';
import { allocationInputsAsOf } from './allocation-inputs';
import { cashlessContactBookingIds } from './contact-invariants';
import { resolvePortfolioRiskPolicy } from './portfolio-risk-policy';
import { bookInputs } from './book-inputs';
import {
  addDays,
  addMonths,
  averageCents,
  roundDivCents,
  BOOK_RULE_CODES,
  freedomProgressBp,
  freedomTargetCents,
  incomePauseAmount,
  lastDayOfMonth,
  monthlyEquivalent,
  monthOf,
  monthsBetween,
  occurrences,
  plannedEventOccurrences,
  PriceUnavailableError,
  targetNeed,
  todayInVienna,
  toEurCents,
  contractVersionOn,
  contractBinding,
  versionOn,
  yearlyEquivalent,
  type AllocMonth,
  type AssignmentEvent,
  type BudgetMonth,
  type CardBalance,
  type CategoryTarget,
  type DebtLoan,
  overdraftLastResort,
  type ForecastItem,
  type Snapshot,
  type FreeAccount,
  type MoneyEvent,
  type OpenOutflow,
  type MonthFlow,
  type RuleInputs,
  type SinkingFund,
  type Rhythm,
} from '@budget/domain';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import {
  account,
  assetClass,
  auditLog,
  booking,
  bookingSplit,
  category,
  categoryTarget,
  envelopeMonth,
  expectedOccurrence,
  expectedPayment,
  expectedPaymentVersion,
  incomePause,
  INCOME_TYPES,
  institution,
  plannedEvent,
  security,
  rule,
} from '../schema';
import { allocationMonth, isIncomeCategorySplit } from './allocation';
import { scheduleVersion, schedulePayment } from './expected';
import { netWorthAsOf, netWorthValuationAsOf, type NetWorth } from './portfolio';
import { MissingFxRateError } from './errors';
import { fxRateOnOrBefore } from './prices';
import { memoizedShared } from './request-memo';
import { budgetLedger, budgetOfLedger } from './queries';
import type { Executor } from './types';
import { freedomExpenses } from './freedom-inputs';
import { statementForecastLegs, statementLegacyKeys } from './statement-settlement-read';

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
/** A marked occurrence: taken out of the plan, or settled by a booking dated `settledOn`. */
type PlanMark =
  | 'skipped'
  | 'missed'
  | { settledOn: string; bookingId: string | null; accountId: string | null; cents: number | null };
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
  paymentLifecycles?: Map<string, PaymentLifecycle>;
  versions: Map<string, VersionRow[]>;
  incomePauses: (typeof incomePause.$inferSelect)[];
  /**
   * Live occurrences taken out of the plan, by `paymentId|dueDate`: `skipped` (gestrichen, a
   * deliberate plan change) and `missed` (ausgefallen). See `isPlannedOccurrence`.
   */
  planMarks: Map<string, PlanMark>;
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
  ledger?: ReturnType<typeof budgetLedger>,
): RuleFacts {
  // Without a ledger of the caller the facts only depend on the day: one read per request and
  // database state (the cache of allocations inside the facts only ever fills with the same values).
  if (ledger === undefined)
    return memoizedShared(db, `ruleFacts|${upTo}`, () => readFacts(db, upTo, budgetLedger(db)));
  return readFacts(db, upTo, ledger);
}

function readFacts(db: Executor, upTo: string, ledger: ReturnType<typeof budgetLedger>): RuleFacts {
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

  const incomePauses = db.select().from(incomePause).where(isNull(incomePause.deletedAt)).all();
  const planMarks = new Map<string, PlanMark>();
  for (const o of db
    .select({
      paymentId: expectedOccurrence.expectedPaymentId,
      dueDate: expectedOccurrence.dueDate,
      status: expectedOccurrence.status,
      bookedOn: booking.date,
      bookingId: booking.id,
      bookedAccountId: booking.accountId,
      bookedCents: booking.amountCents,
    })
    .from(expectedOccurrence)
    .leftJoin(booking, eq(booking.id, expectedOccurrence.bookingId))
    .where(
      and(
        isNull(expectedOccurrence.deletedAt),
        inArray(expectedOccurrence.status, ['skipped', 'missed', 'received', 'deviating']),
      ),
    )
    .all())
    planMarks.set(
      `${o.paymentId}|${o.dueDate}`,
      o.status === 'received' || o.status === 'deviating'
        ? {
            settledOn: o.bookedOn ?? o.dueDate,
            bookingId: o.bookingId,
            accountId: o.bookedAccountId,
            cents: o.bookedCents,
          }
        : (o.status as 'skipped' | 'missed'),
    );

  const categoryKindById = new Map(categories.map((c) => [c.id, c.kind]));
  const cashless = cashlessContactBookingIds(db);
  const incomeSplits = db
    .select({
      bookingId: booking.id,
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
      return !cashless.has(s.bookingId) &&
        isIncomeCategorySplit(s.categoryId, kind) &&
        s.incomeTypeId !== null &&
        s.cents > 0
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

  const payments = db.select().from(expectedPayment).where(isNull(expectedPayment.deletedAt)).all();
  const paymentLifecycles = readPaymentLifecycles(
    db,
    payments.map((p) => p.id),
  );
  return {
    accounts,
    categories,
    targets: db.select().from(categoryTarget).where(isNull(categoryTarget.deletedAt)).all(),
    payments,
    paymentLifecycles,
    versions,
    incomePauses,
    planMarks,
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

const netIncomeOf = (a: AllocMonth): number =>
  a.incomeCents + roundDivCents(a.annualIncomeCents, 12);

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

/**
 * Is this occurrence of the rule still part of the plan? The one shared answer for the liquidity
 * forecast, the Heute chart, R07, the reports and the cover limits. A `skipped` (gestrichen)
 * occurrence never is. A `missed` (ausgefallen) one is not either, unless `keepMissed`: Heute
 * still lists a missed payment of the past as a gap. A settled one (`received`/`deviating`, linked
 * to a booking) stays planned, except with `skipSettledBy` (the forecast's start day) when its
 * booking is dated on or before that day: the balance already contains it, so counting the
 * occurrence again would pay it twice (#1102). A booking dated later is not in the balance yet.
 */
export function isPlannedOccurrence(
  f: Pick<RuleFacts, 'planMarks'>,
  paymentId: string,
  dueDate: string,
  options: { keepMissed?: boolean; skipSettledBy?: string | undefined } = {},
): boolean {
  const mark = f.planMarks.get(`${paymentId}|${dueDate}`);
  if (typeof mark === 'object')
    return options.skipSettledBy === undefined || mark.settledOn > options.skipSettledBy;
  return mark === undefined || (mark === 'missed' && options.keepMissed === true);
}

/** Translate a scheduled or materialized occurrence to the same forecast EUR basis. */
function forecastOccurrenceCents(
  f: RuleFacts,
  payment: PaymentRow,
  dueDate: string,
  amountCents: number,
  asOf: string,
  applyIncomePauses: boolean,
): number | null {
  const currency = versionOn(f.versions.get(payment.id) ?? [], dueDate)?.currency ?? 'EUR';
  const pause =
    applyIncomePauses && payment.kind === 'inflow'
      ? f.incomePauses.find(
          (row) =>
            row.expectedPaymentId === payment.id &&
            row.startDate <= dueDate &&
            dueDate <= row.endDate,
        )
      : undefined;
  const amount = pause
    ? incomePauseAmount(
        { expectedPaymentId: payment.id, dueDate, kind: payment.kind, currency, amountCents },
        pause,
      )
    : amountCents;
  if (currency === 'EUR') return amount;
  const rate = fxRateOnOrBefore(f.db, currency, asOf);
  return rate ? toEurCents(amount, rate.rateMicro) : null;
}

/**
 * Scheduled occurrences (EUR cents) of the live payments between two days, both included: the
 * rule's occurrences minus the skipped (and, unless `keepMissed`, the missed) ones.
 */
export function scheduled(
  f: RuleFacts,
  from: string,
  to: string,
  asOf: string,
  options: {
    applyIncomePauses?: boolean;
    keepMissed?: boolean;
    skipSettledBy?: string;
    onMissingFx?: (payment: PaymentRow, dueDate: string, currency: string) => void;
  } = {},
) {
  const out: {
    payment: PaymentRow;
    dueDate: string;
    cents: number;
    onBudget: boolean;
    category: CategoryRow | undefined;
  }[] = [];
  const cats = catById(f);
  const accounts = new Map(f.accounts.map((a) => [a.id, a]));
  const replaced = statementLegacyKeys(f.db);
  for (const p of f.payments) {
    const versions = f.versions.get(p.id) ?? [];
    for (const occ of occurrences(
      schedulePayment(p, f.paymentLifecycles?.get(p.id)),
      versions.map(scheduleVersion),
      from,
      to,
    )) {
      if (replaced.has(p.id + '|' + occ.dueDate)) continue;
      // One predicate for income and outflows: a settled occurrence already in the balance leaves.
      if (!isPlannedOccurrence(f, p.id, occ.dueDate, options)) continue;
      const cents = forecastOccurrenceCents(
        f,
        p,
        occ.dueDate,
        occ.amountCents,
        asOf,
        options.applyIncomePauses === true,
      );
      if (cents === null) {
        options.onMissingFx?.(p, occ.dueDate, versionOn(versions, occ.dueDate)!.currency);
        continue;
      }
      const acct = p.accountId ? accounts.get(p.accountId) : undefined;
      out.push({
        payment: p,
        dueDate: occ.dueDate,
        cents,
        onBudget: acct ? isLiquidityAccount(acct, asOf) : !p.accountId,
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
    {
      rhythm: p.rhythm as Rhythm,
      intervalWeeks: p.intervalWeeks,
      startDate: p.startDate,
      endDate: p.endDate,
    },
    f.versions.get(p.id) ?? [],
    day,
  );
  if (!v) return 0;
  if (v.currency === 'EUR') return v.amountCents;
  const rate = fxRateOnOrBefore(f.db, v.currency, day);
  return rate ? toEurCents(v.amountCents, rate.rateMicro) : 0;
}

const monthlyAmount = (f: RuleFacts, p: PaymentRow, day: string): number =>
  monthlyEquivalent(p.rhythm as Rhythm, unitAmount(f, p, day), p.intervalWeeks);
const yearlyAmount = (f: RuleFacts, p: PaymentRow, day: string): number =>
  yearlyEquivalent(p.rhythm as Rhythm, unitAmount(f, p, day), p.intervalWeeks);

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
export function forecastBudgetValues(db: Executor, today: string, budgetIds: string[]) {
  const valuation = netWorthValuationAsOf(db, today);
  return Object.fromEntries(
    budgetIds.map((id) => {
      const value = valuation.byAccount[id];
      if (value !== null) return [id, value ?? 0];
      const currency = valuation.missingFxByAccount[id]?.[0];
      if (currency) throw new MissingFxRateError(currency, today);
      throw new PriceUnavailableError(id, valuation.missingPriceByAccount[id]![0]!, today);
    }),
  );
}

type SourcedForecastItem = ForecastItem & {
  accountId: string | null;
  source: NonNullable<Snapshot['items'][number]['source']>;
  expected: boolean;
  linkedBookingMismatch?: boolean;
};

export function forecastInputs(
  f: RuleFacts,
  asOf: string,
  nw: Pick<NetWorth, 'byAccount'>,
): Omit<NonNullable<RuleInputs['forecast']>, 'items'> & {
  items: SourcedForecastItem[];
  dayZeroItems: SourcedForecastItem[];
  through: string;
  cashAccounts: FreeAccount[];
  openOutflows: OpenOutflow[];
  missingFx: { paymentId: string; dueDate: string; currency: string }[];
} {
  const cur = monthOf(asOf);
  const ref = referenceMonth(asOf);
  const budgetAccounts = f.accounts.filter((a) => isLiquidityAccount(a, asOf));
  const to = addDays(asOf, 365);
  const toItem = (
    payment: PaymentRow,
    dueDate: string,
    cents: number,
    day = dueDate,
  ): SourcedForecastItem => {
    const group = payment.categoryId ? categories.get(payment.categoryId)?.class : undefined;
    const key = `${payment.id}|${dueDate}`;
    const row = byKey.get(key);
    const mark = f.planMarks.get(key);
    const linked = typeof mark === 'object';
    return {
      accountId: linked ? mark.accountId : payment.accountId,
      source: {
        kind: 'expectedOccurrence',
        id: row?.id ?? key,
        dueDay: dueDate,
        ...(linked && mark.bookingId ? { bookingId: mark.bookingId } : {}),
      },
      expected: !linked && cents > 0,
      ...(linked && mark.cents !== row?.cents ? { linkedBookingMismatch: true } : {}),
      day,
      cents,
      kind: cents >= 0 ? 'income' : 'fixed',
      label: payment.name,
      ref: { paymentId: payment.id, dueDate },
      ...(group ? { group } : {}),
    };
  };
  const categories = catById(f);
  const payments = new Map(f.payments.map((p) => [p.id, p]));
  const cashIds = new Set(budgetAccounts.map((a) => a.id));
  const onCashAccount = (id: string | null) => id === null || cashIds.has(id);
  const missingFx: { paymentId: string; dueDate: string; currency: string }[] = [];
  const recordMissingFx = (payment: PaymentRow, dueDate: string, currency: string) => {
    if (onCashAccount(payment.accountId))
      missingFx.push({ paymentId: payment.id, dueDate, currency });
  };
  const internalTransferCents = new Map<string, number>();
  for (const split of f.ledgerSplits) {
    if (
      split.bookingId &&
      split.transferAccountId &&
      cashIds.has(split.accountId) &&
      cashIds.has(split.transferAccountId)
    ) {
      internalTransferCents.set(
        split.bookingId,
        (internalTransferCents.get(split.bookingId) ?? 0) + split.amountCents,
      );
    }
  }
  const replaced = statementLegacyKeys(f.db);
  const stored = f.db
    .select({
      id: expectedOccurrence.id,
      paymentId: expectedOccurrence.expectedPaymentId,
      dueDate: expectedOccurrence.dueDate,
      status: expectedOccurrence.status,
      cents: expectedOccurrence.expectedAmountCents,
    })
    .from(expectedOccurrence)
    .where(isNull(expectedOccurrence.deletedAt))
    .all();
  const byKey = new Map(stored.map((o) => [`${o.paymentId}|${o.dueDate}`, o]));
  // Retain proven transfer identities, never pair legs by matching amounts alone.
  const transferPairs = new Map<
    string,
    { bookingId: string; accountId: string; day: string; cents: number; whole: boolean }[]
  >();
  for (const leg of f.db
    .select({
      bookingId: booking.id,
      accountId: booking.accountId,
      day: booking.date,
      cents: bookingSplit.amountCents,
      wholeId: booking.transferId,
      splitId: bookingSplit.transferId,
    })
    .from(bookingSplit)
    .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
    .where(isNull(booking.deletedAt))
    .all()) {
    const id = leg.wholeId ?? leg.splitId;
    if (!id) continue;
    const pair = transferPairs.get(id) ?? [];
    const existing = pair.find((entry) => entry.bookingId === leg.bookingId);
    if (existing) existing.cents += leg.cents;
    else pair.push({ ...leg, whole: leg.wholeId !== null });
    transferPairs.set(id, pair);
  }
  const linkedTransferItems: SourcedForecastItem[] = [];
  const includedTransfers = new Set<string>();
  const transitDebitDay = (pair: NonNullable<ReturnType<typeof transferPairs.get>>) => {
    if (pair.length !== 2 || pair[0]!.cents !== -pair[1]!.cents) return null;
    const debit = pair.find((leg) => leg.cents < 0);
    const receipt = pair.find((leg) => leg.cents > 0);
    if (!debit || !receipt || !pair.every((leg) => leg.whole)) return null;
    const from = f.accounts.find((a) => a.id === debit.accountId);
    const to = f.accounts.find((a) => a.id === receipt.accountId);
    const bank = (a: AccountRow | undefined) => a?.type === 'checking' || a?.type === 'savings';
    return from &&
      to &&
      bank(from) &&
      bank(to) &&
      from.currency === to.currency &&
      debit.day >= from.openingDate &&
      receipt.day >= to.openingDate &&
      debit.day >= to.openingDate
      ? debit.day
      : null;
  };
  const addLinkedTransfers = (payment: PaymentRow, dueDate: string, bookingId: string) => {
    for (const [id, pair] of transferPairs) {
      if (includedTransfers.has(id) || !pair.some((leg) => leg.bookingId === bookingId)) continue;
      if (!pair.every((leg) => cashIds.has(leg.accountId))) continue;
      if (pair.length !== 2 || pair[0]!.cents !== -pair[1]!.cents)
        throw new RangeError('Ambiguous linked internal transfer');
      includedTransfers.add(id);
      const transitDay = transitDebitDay(pair);
      for (const leg of pair) {
        const day = transitDay ?? leg.day;
        if (day <= asOf || day > to) continue;
        const item = toItem(payment, dueDate, leg.cents, day);
        linkedTransferItems.push({
          ...item,
          accountId: leg.accountId,
          expected: false,
          linkedBookingMismatch: false,
          source: { ...item.source, id: `${id}|${leg.bookingId}`, bookingId: leg.bookingId },
        });
      }
    }
  };
  // Stored obligations survive changes to the recurring schedule. A future-dated linked debit
  // uses the actual booking's date, account and amount until it is included in cash.
  const storedItems = stored.flatMap((o): SourcedForecastItem[] => {
    const payment = payments.get(o.paymentId);
    const key = `${o.paymentId}|${o.dueDate}`;
    if (!payment || replaced.has(key)) return [];
    const mark = f.planMarks.get(key);
    if (typeof mark === 'object') {
      if (mark.bookingId) addLinkedTransfers(payment, o.dueDate, mark.bookingId);
      const wholePair = [...transferPairs.values()].find((pair) =>
        pair.some((leg) => leg.whole && leg.bookingId === mark.bookingId),
      );
      const cashDay = (wholePair && transitDebitDay(wholePair)) ?? mark.settledOn;
      if (cashDay <= asOf || cashDay > to) return [];
      if (mark.accountId === null || !cashIds.has(mark.accountId) || mark.cents === null) return [];
      const externalCents =
        mark.cents - (mark.bookingId ? (internalTransferCents.get(mark.bookingId) ?? 0) : 0);
      return externalCents !== 0 ? [toItem(payment, o.dueDate, externalCents, cashDay)] : [];
    }
    if (
      payment.kind !== 'outflow' ||
      o.status !== 'expected' ||
      o.dueDate > asOf ||
      !onCashAccount(payment.accountId)
    )
      return [];
    const amount = forecastOccurrenceCents(f, payment, o.dueDate, o.cents, asOf, false);
    if (amount === null)
      recordMissingFx(
        payment,
        o.dueDate,
        versionOn(f.versions.get(payment.id) ?? [], o.dueDate)!.currency,
      );
    return amount === null ? [] : [toItem(payment, o.dueDate, amount)];
  });
  const previews = scheduled(f, asOf, to, asOf, {
    applyIncomePauses: true,
    onMissingFx: (payment, dueDate, currency) => {
      if (dueDate === asOf && payment.kind === 'inflow') return;
      if (typeof f.planMarks.get(`${payment.id}|${dueDate}`) !== 'object')
        recordMissingFx(payment, dueDate, currency);
    },
  }).flatMap((o): SourcedForecastItem[] => {
    const key = `${o.payment.id}|${o.dueDate}`;
    if (!o.onBudget || typeof f.planMarks.get(key) === 'object') return [];
    if (o.dueDate === asOf && (o.payment.kind === 'inflow' || byKey.has(key))) return [];
    return [toItem(o.payment, o.dueDate, o.cents)];
  });
  const statementItems: { item: SourcedForecastItem; internal: boolean }[] = statementForecastLegs(
    f.db,
    null,
    to,
    cashIds,
  ).flatMap((leg) => {
    const internal =
      leg.counterpartyAccountId !== undefined && cashIds.has(leg.counterpartyAccountId);
    if (leg.day <= asOf && (leg.bookingId !== null || (!internal && leg.cents >= 0))) return [];
    return [
      {
        item: {
          accountId: leg.accountId,
          source: {
            kind: leg.kind === 'settlement' ? 'cardPayment' : 'cardCredit',
            id: leg.id,
            dueDay: leg.day,
            ...(leg.bookingId ? { bookingId: leg.bookingId } : {}),
          },
          expected: false,
          day: leg.day,
          cents: leg.cents,
          kind: 'event' as const,
          label: leg.kind === 'settlement' ? 'Abrechnungsausgleich' : 'Ausgabengutschrift',
        },
        internal,
      },
    ];
  });
  const datedItems: SourcedForecastItem[] = [
    ...previews,
    ...storedItems,
    ...f.plannedEvents
      .filter((e) => {
        const a = e.accountId ? f.accounts.find((x) => x.id === e.accountId) : undefined;
        return e.enabled && (e.accountId === null || (a && isLiquidityAccount(a, asOf)));
      })
      .flatMap((event) =>
        plannedEventOccurrences(event, addDays(asOf, 1), to).map((e) => ({
          accountId: event.accountId,
          source: { kind: 'plannedEvent' as const, id: e.eventId, dueDay: e.date },
          expected: e.amountCents > 0,
          day: e.date,
          cents: e.amountCents,
          kind: 'event' as const,
          label: e.name,
        })),
      ),
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
  const cashAccounts = budgetAccounts.map((a) => ({
    id: a.id,
    name: a.name,
    balanceCents: nw.byAccount[a.id] ?? 0,
    overdraftLimitCents: a.overdraftLimitCents,
  }));
  const openOutflows = [
    ...datedItems,
    ...statementItems.filter(({ internal }) => !internal).map(({ item }) => item),
  ]
    .flatMap((item, index): OpenOutflow[] => {
      if (item.cents >= 0) return [];
      const key = item.ref && `${item.ref.paymentId}|${item.ref.dueDate}`;
      return [
        {
          id: key ? (byKey.get(key)?.id ?? key) : `forecast-event-${index}`,
          label: item.label ?? '',
          day: item.day,
          cents: -item.cents,
        },
      ];
    })
    .sort((a, b) => a.day.localeCompare(b.day) || a.label.localeCompare(b.label));
  const forecastItems = [
    ...statementItems.map(({ item }) => item),
    ...datedItems,
    ...linkedTransferItems,
  ];
  return {
    cashAccounts,
    openOutflows,
    missingFx,
    through: to,
    dayZeroItems: forecastItems
      .filter((item) => item.day <= asOf)
      .map((item) => ({ ...item, day: asOf })),
    startDay: asOf,
    // Projected day zero deducts open obligations already due; the cash balance does not.
    startCents:
      cashAccounts.reduce((sum, a) => sum + a.balanceCents, 0) +
      forecastItems.filter((item) => item.day <= asOf).reduce((sum, item) => sum + item.cents, 0),
    items: forecastItems.filter((item) => item.day > asOf),
    variableMonthlyCents,
    lastResortCents: overdraftLastResort(cashAccounts),
  };
}

/** R16 alone needs the selected Anlagebasis, not valuations of unrelated accounts. */
export function freedomRuleInput(
  db: Executor,
  asOf: string,
  facts = loadFacts(db, asOf),
  current = allocationInputsAsOf(db, asOf),
): RuleInputs['freedom'] {
  const ref = referenceMonth(asOf);
  if (!facts.budgetByMonth.has(monthOf(asOf)) && !facts.budgetByMonth.has(ref)) return null;
  const progressAt = (day: string, refMonth: string) => {
    const invested = (day === asOf ? current : allocationInputsAsOf(db, day)).valueCents;
    if (invested === null || !Number.isSafeInteger(invested)) return null;
    try {
      return { invested, spend: freedomExpenses(facts, refMonth) };
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return null;
    }
  };
  const now = progressAt(asOf, ref);
  if (!now) return null;
  const previousRef = addMonths(ref, -3);
  const previousDay = lastDayOfMonth(previousRef);
  const previous =
    facts.budgetByMonth.has(previousRef) && previousDay >= facts.firstMonth
      ? progressAt(previousDay, previousRef)
      : null;
  return {
    investedCents: now.invested,
    annualSpendCents: now.spend,
    previousProgressBp:
      previous && previous.spend > 0
        ? freedomProgressBp(previous.invested, freedomTargetCents(previous.spend))
        : null,
  };
}

/** The unchanged R06/R08 facts, independently readable without portfolio policy. */
export function debtServiceRuleInputs(
  f: RuleFacts,
  asOf: string,
  byAccount: Readonly<Record<string, number>>,
): Pick<RuleInputs, 'cards' | 'loanPaymentsMonthlyCents' | 'netIncomeMonthlyCents'> {
  const ref = referenceMonth(asOf);
  const cur = monthOf(asOf);
  const accounts = f.accounts.filter((a) => a.openingDate <= asOf);
  const cats = catById(f);
  const onBudget = new Set(accounts.filter((a) => a.onBudget).map((a) => a.id));
  const curEnvelopes = f.budgetByMonth.get(cur)?.envelopes ?? {};
  const outflows = f.payments.filter((p) => p.kind === 'outflow');
  const isMinimumDebt = (c: CategoryRow | undefined) => c?.kind === 'debt' && (c.stage ?? 1) === 1;
  const isDebt = (p: PaymentRow) => (p.categoryId ? isMinimumDebt(cats.get(p.categoryId)) : false);
  const refAlloc = allocOf(f, ref);
  const netIncome = refAlloc ? netIncomeOf(refAlloc) : null;
  const balances = new Map(accounts.map((a) => [a.id, byAccount[a.id] ?? 0] as const));
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
  const debtAccounts = accounts.filter(
    (a) =>
      a.closedAt === null &&
      (a.type === 'loan' ||
        a.role === 'debt' ||
        (a.type === 'credit_card' &&
          cards.some((c) => c.id === a.id && c.owedCents > c.availableCents))) &&
      (byAccount[a.id] ?? 0) < 0,
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
  return {
    cards,
    loanPaymentsMonthlyCents,
    netIncomeMonthlyCents: netIncome !== null && netIncome > 0 ? netIncome : null,
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
  const { cards, loanPaymentsMonthlyCents, netIncomeMonthlyCents } = debtServiceRuleInputs(
    f,
    asOf,
    nw.byAccount,
  );

  const forecast = hasBudget ? forecastInputs(f, asOf, nw) : null;

  // R08, R10: contractual payments in force
  const outflows = f.payments.filter((p) => p.kind === 'outflow');
  // Debt categories in waterfall stage 1 are the contractual minimum rate; later stages are
  // extra repayments (Sondertilgung).
  const isMinimumDebt = (c: CategoryRow | undefined) => c?.kind === 'debt' && (c.stage ?? 1) === 1;
  const bindingOf = (p: PaymentRow) => {
    const cat = cats.get(p.categoryId ?? '');
    return contractBinding(
      { ...p, categoryKind: cat?.kind ?? null, categoryStage: cat?.stage ?? null },
      asOf,
    );
  };
  const fixedCosts =
    outflows.length > 0
      ? {
          fixedMonthlyCents: outflows
            .filter((p) => bindingOf(p) === 'fixed')
            .reduce((s, p) => s + monthlyAmount(f, p, asOf), 0),
          periodicAnnualCents: outflows
            .filter((p) => bindingOf(p) === 'periodic')
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
  const allocationInputs = allocationInputsAsOf(db, asOf);
  const positions = allocationInputs.positions;
  const portfolioRiskPolicy = resolvePortfolioRiskPolicy(db, asOf, allocationInputs.valueCents);
  const classTargets = portfolioRiskPolicy.targets;

  const freedom = freedomRuleInput(db, asOf, f, allocationInputs);

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
    netIncomeMonthlyCents,
    loanPaymentsMonthlyCents,
    fixedCosts,
    debt,
    flows,
    windfall,
    positions,
    classTargets,
    portfolioRiskPolicy,
    allocationQuality: allocationInputs.quality,
    names: {
      assetClasses: f.classNames,
      securities: Object.fromEntries([...f.securities.values()].map((s) => [s.id, s.name])),
      platforms: f.platformNames,
    },
    freedom,
  };
}

/** Read-only R02/R11 budget facts without requiring unrelated wealth valuations or policy. */
export function healthBudgetInputs(facts: RuleFacts, asOf: string) {
  const ref = referenceMonth(asOf);
  const from = facts.firstMonth > addMonths(ref, -11) ? facts.firstMonth : addMonths(ref, -11);
  const months = from <= ref ? monthsBetween(from, ref) : [];
  return {
    refMonth: ref,
    firstMonth: facts.firstMonth,
    months,
    complete: months.length > 0 && months.every((month) => facts.budgetByMonth.has(month)),
    flows: months.map((month) => {
      const allocation = allocOf(facts, month);
      return allocation
        ? {
            month,
            incomeCents: netIncomeOf(allocation),
            spendingCents: spent(facts, month, (c) => c.class === 'need' || c.class === 'want'),
          }
        : null;
    }),
    needSpending: months.map((month) => ({
      month,
      cents: spent(facts, month, (c) => c.class === 'need'),
    })),
  };
}
