import {
  addDays,
  addMonths,
  allocation,
  cents,
  expectedIncome,
  formatEuro,
  incomeWindow,
  lastDayOfMonth,
  monthFindings,
  monthIncomeOf,
  monthlyEquivalent,
  monthOf,
  monthResult,
  monthsBetween,
  moneyFlow,
  netWorthWindow,
  planSummary,
  topSpending,
  versionOn,
  yearlyEquivalent,
  type Allocation,
  type BudgetClass,
  type ExpectedIncome,
  type ExpectedIncomeInput,
  type IncomeFact,
  type IncomeWindow,
  type MonthFinding,
  type MonthIncome,
  type MonthResult,
  type MoneyFlow,
  type PlanFact,
  type PriceChange,
  type Rhythm,
  type TopSpendingRow,
} from '@budget/domain';
import { categoryGroup, contact, incomeType, INCOME_TYPES, payee } from '../schema';
import { allocationMonth } from './allocation';
import { overviewData } from './report-ledger';
import { upcoming } from './expected';
import { availableSection, occurrencesBetween, paceOfMonth, type Heute } from './heute';
import type { HeuteUnavailable } from './heute';
import { netWorthAsOf, netWorthDaily } from './portfolio';
import { ruleStatuses, type RuleStatusEntry } from './rules';
import { loadFacts, scheduled, type RuleFacts } from './rule-inputs';
import type { Executor } from './types';
import { withValuationRange } from './valuation-notes';

/**
 * Read models of the report group "Monat und Einkommen": 1.1 Monats-One-Pager, 1.3 Einnahmen and
 * 1.4 Geldfluss. They read the same facts as Heute, Plan and the rule book (`loadFacts`: budget
 * months, categories, payments) and hand the figures to the pure functions in
 * `@budget/domain` (`reports/month`). Only reads. A month after the current one has no report.
 *
 * Income counts splits of inflows on budget accounts that carry an income type and sit in no
 * category or in an income category: transfers, contact repayments (they run through "Auslagen")
 * and bookings without an income type (e.g. sale proceeds) are no income. Kapitalerträge and
 * refunds are classified apart, see `incomeKind`.
 */

export class MonthInFutureError extends RangeError {
  constructor(readonly month: string) {
    super(`The month ${month} has not started yet`);
  }
}

const incomeKind = (typeId: string): IncomeFact['kind'] =>
  typeId === INCOME_TYPES.capital.id
    ? 'capital'
    : typeId === INCOME_TYPES.refund.id
      ? 'refund'
      : 'earned';

const MONTH_NAMES = [
  'Jänner',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];
const monthName = (month: string) => MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month;
const shortDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
const money = (value: number) => formatEuro(cents(value), { cents: false });

interface Frame {
  today: string;
  month: string;
  /** The day the month is evaluated on: today in the current month, else its last day. */
  asOf: string;
  /** The current month is not over yet. */
  partial: boolean;
  /** First month with budget records. */
  firstMonth: string;
  facts: RuleFacts;
}

function frame(db: Executor, today: string, month: string): Frame {
  if (month > monthOf(today)) throw new MonthInFutureError(month);
  const asOf = month === monthOf(today) ? today : lastDayOfMonth(month);
  const facts = loadFacts(db, asOf);
  // `facts.firstMonth` is capped at the evaluated day; the records begin with the first budget account.
  const starts = facts.accounts.filter((a) => a.onBudget).map((a) => monthOf(a.openingDate));
  const firstMonth = starts.reduce((a, m) => (m < a ? m : a), monthOf(today));
  return { today, month, asOf, partial: asOf < lastDayOfMonth(month), firstMonth, facts };
}

/** The months of `[from, month]` that have records. */
const monthsFrom = (f: Frame, from: string): string[] =>
  monthsBetween(from < f.firstMonth ? f.firstMonth : from, f.month);

/** Income splits of the budget accounts up to `asOf`, with their type. */
function incomeFacts(db: Executor, f: Frame, fromMonth: string): IncomeFact[] {
  const types = new Map(
    db
      .select()
      .from(incomeType)
      .all()
      .map((t) => [t.id, t]),
  );
  return overviewData(db).splits.flatMap((s): IncomeFact[] => {
    if (
      s.kind !== 'income' ||
      s.incomeTypeId === null ||
      s.incomeGroup === 'unclassified' ||
      s.date > f.asOf ||
      monthOf(s.date) < fromMonth
    )
      return [];
    const type = types.get(s.incomeTypeId);
    return [
      {
        month: monthOf(s.date),
        typeId: s.incomeTypeId,
        typeName: type?.name ?? 'Sonstiges',
        kind: incomeKind(s.incomeTypeId),
        sortOrder: type?.sortOrder ?? 0,
        cents: s.amountCents,
      },
    ];
  });
}

/** Spending per category in a month, positive cents (refunds net); categories without class are left out. */
function spendingOf(f: Frame, month: string): Map<string, number> {
  const envelopes = f.facts.budgetByMonth.get(month)?.envelopes ?? {};
  const out = new Map<string, number>();
  for (const c of f.facts.categories)
    if (c.class) out.set(c.id, 0 - (envelopes[c.id]?.activityCents ?? 0));
  return out;
}

function classTotals(f: Frame, months: string[]): Record<BudgetClass, number> {
  const t: Record<BudgetClass, number> = { need: 0, want: 0, future: 0 };
  for (const m of months)
    for (const c of f.facts.categories) {
      if (!c.class) continue;
      t[c.class] += spendingOf(f, m).get(c.id) ?? 0;
    }
  return t;
}

/** Current/past month result shared by Heute and the One-Pager. */
export function monthResultRead(db: Executor, today: string, month: string): MonthResult {
  const f = frame(db, today, month);
  return resultOf(f, monthIncomeOf(incomeFacts(db, f, month), month));
}

function resultOf(f: Frame, income: MonthIncome): MonthResult {
  const totals = classTotals(f, [f.month]);
  return monthResult({
    earnedCents: income.earnedCents,
    consumptionCents: totals.need + totals.want,
    futureCents: totals.future,
  });
}

// ---------------------------------------------------------------------------------------------
// 1.3 Einnahmen
// ---------------------------------------------------------------------------------------------

export interface IncomeReport {
  month: string;
  /** The day the report is as of (today in the current month). */
  asOf: string;
  partial: boolean;
  firstMonth: string;
  /** The selected month precedes the first record. */
  beforeRecords: boolean;
  income: MonthIncome;
  /** Already-held contact credit, visible separately and excluded from household income. */
  contactWriteOffs: ReturnType<typeof overviewData>['splits'];
  expected: ExpectedIncome;
  /** The expected payments of the month are materialised and matched (else they come from the schedule). */
  expectedMaterialised: boolean;
  /** Expected income in another currency than EUR is not part of the table. */
  foreignCurrencyCount: number;
  window: IncomeWindow;
}

const ownIncomeTypes = new Set<string>([INCOME_TYPES.capital.id, INCOME_TYPES.refund.id]);

/**
 * Expected inflows of the month. Materialised occurrences carry their match status; without any
 * (the refresh has not run for the month) the payment schedule stands in, and a due payment is
 * `unlinked`, "noch nicht zugeordnet": nothing is claimed about whether it arrived.
 */
function expectedOf(db: Executor, f: Frame, income: MonthIncome) {
  const from = `${f.month}-01`;
  const to = lastDayOfMonth(f.month);
  const stored = upcoming(db, from, to, { kind: 'inflow' });
  let lines: ExpectedIncomeInput[];
  let foreign = 0;
  let materialised = stored.length > 0;
  if (materialised) {
    const eur = stored.filter((r) => r.currency === 'EUR');
    foreign = stored.length - eur.length;
    lines = eur.map((r) => ({
      paymentId: r.paymentId,
      name: r.name,
      sub: [r.payeeName ?? r.contactName, r.accountName].filter(Boolean).join(' · '),
      typeId: r.incomeTypeId,
      dueDate: r.dueDate,
      status: r.status,
      expectedCents: r.amountCents,
      receivedCents: r.bookedAmountCents ?? 0,
    }));
  } else {
    const payees = new Map(
      db
        .select({ id: payee.id, name: payee.name })
        .from(payee)
        .all()
        .map((p) => [p.id, p.name]),
    );
    const contacts = new Map(
      db
        .select({ id: contact.id, name: contact.name })
        .from(contact)
        .all()
        .map((c) => [c.id, c.name]),
    );
    const accounts = new Map(f.facts.accounts.map((a) => [a.id, a.name]));
    lines = scheduled(f.facts, from, to, f.today)
      .filter((o) => o.payment.kind === 'inflow' && o.onBudget)
      .map((o) => ({
        paymentId: o.payment.id,
        name: o.payment.name,
        sub: [
          (o.payment.payeeId ? payees.get(o.payment.payeeId) : undefined) ??
            (o.payment.contactId ? contacts.get(o.payment.contactId) : undefined),
          o.payment.accountId ? accounts.get(o.payment.accountId) : undefined,
        ]
          .filter(Boolean)
          .join(' · '),
        typeId: o.payment.incomeTypeId,
        dueDate: o.dueDate,
        status: 'unlinked' as const,
        expectedCents: o.cents,
        receivedCents: 0,
      }));
    materialised = false;
  }
  return {
    foreignCurrencyCount: foreign,
    materialised,
    expected: expectedIncome({
      today: f.today,
      booked: income.types,
      excludedTypeIds: ownIncomeTypes,
      expected: lines,
    }),
  };
}

/** Einnahmen: expected against received, by income type over twelve months, Kapitalerträge apart. */
export function monthIncomeReport(db: Executor, today: string, month: string): IncomeReport {
  const f = frame(db, today, month);
  const months = monthsFrom(f, addMonths(month, -11));
  const facts = incomeFacts(db, f, months[0] ?? month);
  const income = monthIncomeOf(facts, month);
  const { expected, foreignCurrencyCount, materialised } = expectedOf(db, f, income);
  return {
    month,
    asOf: f.asOf,
    partial: f.partial,
    firstMonth: f.firstMonth,
    beforeRecords: month < f.firstMonth,
    income,
    contactWriteOffs: overviewData(db).splits.filter(
      (s) =>
        s.kind === 'income' &&
        s.incomeGroup === 'unclassified' &&
        s.incomeTypeId !== null &&
        monthOf(s.date) === month &&
        s.date <= f.asOf,
    ),
    expected,
    expectedMaterialised: materialised,
    foreignCurrencyCount,
    window: incomeWindow(months.map((m) => monthIncomeOf(facts, m))),
  };
}

// ---------------------------------------------------------------------------------------------
// 1.4 Geldfluss
// ---------------------------------------------------------------------------------------------

export type FlowSpan = 'month' | 'year';

export interface FlowReport {
  month: string;
  span: FlowSpan;
  asOf: string;
  partial: boolean;
  firstMonth: string;
  beforeRecords: boolean;
  /** First and last month the flow covers (the twelve months end at the last full month). */
  from: string;
  to: string;
  monthCount: number;
  flow: MoneyFlow;
  /** Uncategorised refunds in the span: no income, not in the flow. */
  refundCents: number;
}

/** Geldfluss of a month or of the twelve months up to the last full month. */
export function monthFlowReport(
  db: Executor,
  today: string,
  month: string,
  span: FlowSpan,
): FlowReport {
  const f = frame(db, today, month);
  const to = span === 'year' && f.partial ? addMonths(month, -1) : month;
  const months = span === 'month' ? [month] : monthsBetween(addMonths(to, -11), to);
  const covered = months.filter((m) => m >= f.firstMonth);
  const facts = incomeFacts(db, f, covered[0] ?? month);
  const incomes = covered.map((m) => monthIncomeOf(facts, m));
  const byType = new Map<string, { typeId: string | null; name: string; cents: number }>();
  for (const i of incomes)
    for (const t of i.types) {
      const e = byType.get(t.typeId ?? '') ?? { typeId: t.typeId, name: t.name, cents: 0 };
      e.cents += t.cents;
      byType.set(t.typeId ?? '', e);
    }
  const groupNames = new Map(
    db
      .select()
      .from(categoryGroup)
      .all()
      .map((g) => [g.id, g.name]),
  );
  const perGroup = new Map<string, Map<string, number>>();
  for (const m of covered) {
    const spent = spendingOf(f, m);
    for (const c of f.facts.categories) {
      if (!c.class) continue;
      const key = `${c.class}|${groupNames.get(c.groupId) ?? 'Ohne Gruppe'}`;
      const groups = perGroup.get(c.class) ?? new Map<string, number>();
      groups.set(key, (groups.get(key) ?? 0) + (spent.get(c.id) ?? 0));
      perGroup.set(c.class, groups);
    }
  }
  const flow = moneyFlow({
    income: [...byType.values()],
    capitalCents: incomes.reduce((a, i) => a + i.capitalCents, 0),
    classes: (['need', 'want', 'future'] as const).map((c) => ({
      class: c,
      groups: [...(perGroup.get(c) ?? new Map<string, number>()).entries()].map(([key, cents]) => ({
        name: key.slice(key.indexOf('|') + 1),
        cents,
      })),
    })),
  });
  return {
    month,
    span,
    asOf: f.asOf,
    partial: f.partial,
    firstMonth: f.firstMonth,
    beforeRecords: to < f.firstMonth,
    from: covered[0] ?? to,
    to,
    monthCount: covered.length,
    flow,
    refundCents: incomes.reduce((a, i) => a + i.refundCents, 0),
  };
}

// ---------------------------------------------------------------------------------------------
// 1.1 Monats-One-Pager
// ---------------------------------------------------------------------------------------------

export interface OnePagerNetWorth {
  cents: number;
  previousMonthEndCents: number;
  deltaCents: number;
  ownCents: number;
  marketCents: number;
  /** The month ends of the last 12 months (the current month: today), oldest first. */
  series: Array<{ month: string; cents: number }>;
}

export interface OnePagerCheck {
  total: number;
  ok: number;
  warn: number;
  bad: number;
  notRated: number;
  /** Rule cells in rule-book order. */
  rules: RuleStatusEntry[];
  /** Names of the violated rules. */
  violated: string[];
}

export interface OnePager {
  month: string;
  today: string;
  previousMonth: string;
  asOf: string;
  partial: boolean;
  firstMonth: string;
  beforeRecords: boolean;
  result: MonthResult;
  /** Kapitalerträge of the month: shown as a note, not part of the result. */
  capitalCents: number;
  incomeRows: Array<{
    bookingId: string;
    typeId: string | null;
    name: string;
    payer: string | null;
    cents: number;
    kind: 'household' | 'capital' | 'refund' | 'unclassified';
  }>;
  allocation: Allocation;
  netWorth: OnePagerNetWorth | HeuteUnavailable;
  top: TopSpendingRow[];
  /** `over` holds the four most overspent categories, `overCount` all of them. */
  plan: { total: number; overCount: number; over: PlanFact[] };
  check: OnePagerCheck | HeuteUnavailable;
  pace: Heute['pace'];
  findings: MonthFinding[];
}

function netWorthOf(db: Executor, f: Frame): OnePagerNetWorth {
  const end = netWorthAsOf(db, f.asOf).totalCents;
  const monthStart = `${f.month}-01`;
  const before = addDays(monthStart, -1);
  const start = netWorthAsOf(db, before).totalCents;
  const rows = netWorthDaily(db, monthStart, f.asOf);
  const chain = netWorthWindow(rows, start);
  if (chain.nowCents !== end) throw new Error('Net worth series and netWorthAsOf disagree');
  const months = monthsFrom(f, addMonths(f.month, -11));
  return {
    cents: end,
    previousMonthEndCents: start,
    deltaCents: chain.deltaCents,
    ownCents: chain.ownCents,
    marketCents: chain.marketCents,
    series: months.map((m) => ({
      month: m,
      cents: m === f.month ? end : netWorthAsOf(db, lastDayOfMonth(m)).totalCents,
    })),
  };
}

function checkOf(db: Executor, f: Frame): OnePagerCheck {
  const rules = ruleStatuses(db, f.asOf, f.facts);
  const count = (s: RuleStatusEntry['status']) => rules.filter((r) => r.status === s).length;
  return {
    total: rules.length,
    ok: count('ok'),
    warn: count('warn'),
    bad: count('bad'),
    notRated: count(null),
    rules,
    violated: rules.filter((r) => r.status === 'bad').map((r) => r.name),
  };
}

/** Price changes of fixed costs that take effect in the month (EUR only). */
function priceChanges(f: Frame): PriceChange[] {
  const categories = new Map(f.facts.categories.map((c) => [c.id, c]));
  const out: PriceChange[] = [];
  for (const p of f.facts.payments) {
    if (p.kind !== 'outflow' || !p.categoryId) continue;
    if (categories.get(p.categoryId)?.kind !== 'fixed') continue;
    const versions = f.facts.versions.get(p.id) ?? [];
    const next = versions.find((v) => monthOf(v.validFrom) === f.month);
    if (!next) continue;
    const old = versionOn(versions, addDays(next.validFrom, -1));
    if (!old || old.currency !== 'EUR' || next.currency !== 'EUR') continue;
    if (old.amountCents === next.amountCents) continue;
    out.push({
      name: p.name,
      oldYearlyCents: yearlyEquivalent(p.rhythm as Rhythm, old.amountCents),
      newYearlyCents: yearlyEquivalent(p.rhythm as Rhythm, next.amountCents),
      oldMonthlyCents: monthlyEquivalent(p.rhythm as Rhythm, old.amountCents),
      newMonthlyCents: monthlyEquivalent(p.rhythm as Rhythm, next.amountCents),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The Monats-One-Pager: result chain, 50/30/20, net worth, largest spending, plan, check, pace. */
export function monthOnePager(db: Executor, today: string, month: string): OnePager {
  return withValuationRange(
    `${month}-01`,
    month === monthOf(today) ? today : lastDayOfMonth(month),
    () => onePagerInRange(db, today, month),
  );
}

function onePagerInRange(db: Executor, today: string, month: string): OnePager {
  const f = frame(db, today, month);
  const previousMonth = addMonths(month, -1);
  const incomeFrom = previousMonth < f.firstMonth ? month : previousMonth;
  const facts = incomeFacts(db, f, incomeFrom);
  const income = monthIncomeOf(facts, month);
  const ledger = overviewData(db);
  const names = new Map(ledger.incomeTypes.map((t) => [t.id, t.name]));
  const incomeRows: OnePager['incomeRows'] = ledger.splits
    .filter((s) => s.kind === 'income' && monthOf(s.date) === month && s.date <= f.asOf)
    .map((s) => ({
      bookingId: s.bookingId,
      typeId: s.incomeTypeId,
      name: names.get(s.incomeTypeId ?? '') ?? 'Sonstiges',
      payer: s.payeeName,
      cents: s.amountCents,
      kind: s.incomeGroup ?? 'household',
    }));
  const previousIncome = monthIncomeOf(facts, previousMonth);
  const result = resultOf(f, income);

  // 50/30/20 on assigned money. Income is household income only; the twelfths of the expected
  // special payments stay as the allocation read model has them.
  const envelopes = f.facts.budgetByMonth.get(month)?.envelopes;
  const assigned = envelopes ? allocationMonth(db, month, envelopes) : null;
  const special = income.types.find((t) => t.typeId === INCOME_TYPES.special.id)?.cents ?? 0;
  const alloc = allocation([
    assigned ? assigned : { incomeCents: 0, annualIncomeCents: 0, items: [] },
  ]);

  const spent = spendingOf(f, month);
  const spentBefore = spendingOf(f, previousMonth);
  const cats = f.facts.categories.filter((c) => c.class);
  const top = topSpending(
    cats.map((c) => ({
      id: c.id,
      name: c.name,
      class: c.class as BudgetClass,
      kind: c.kind,
      cents: spent.get(c.id) ?? 0,
      previousCents: spentBefore.get(c.id) ?? 0,
    })),
  );
  const planFacts: PlanFact[] = cats
    .filter((c) => c.class !== 'future')
    .map((c) => {
      const e = envelopes?.[c.id];
      return {
        id: c.id,
        name: c.name,
        budgetedCents: (e?.carryCents ?? 0) + (e?.assignedCents ?? 0),
        spentCents: spent.get(c.id) ?? 0,
        overspentCents: e?.overspentCents ?? 0,
      };
    });
  const plan = planSummary(planFacts);

  const occurrences = occurrencesBetween(
    db,
    f.facts,
    `${month}-01`,
    lastDayOfMonth(month),
    today,
    f.facts.budgetByMonth.get(monthOf(today)),
  );
  const pace = paceOfMonth(f.facts, month, today, occurrences);
  const { expected } = expectedOf(db, f, income);

  const salaryId = INCOME_TYPES.salary.id;
  const salaryNow = income.types.find((t) => t.typeId === salaryId)?.cents ?? 0;
  const salaryBefore = previousIncome.types.find((t) => t.typeId === salaryId)?.cents ?? 0;
  const variable = cats
    .filter((c) => c.kind === 'variable' && c.class !== 'future')
    .map((c) => ({ c, d: (spent.get(c.id) ?? 0) - (spentBefore.get(c.id) ?? 0) }))
    .sort((a, b) => b.d - a.d || a.c.name.localeCompare(b.c.name))[0];
  const topOver = plan.over[0];
  const findings = monthFindings({
    money,
    open: f.partial
      ? {
          day: shortDay(f.asOf),
          pendingCents: expected.pendingCents,
          pendingCount: expected.pendingCount,
        }
      : null,
    specialIncomeCents: special,
    salaryChangeCents: salaryNow > 0 && salaryBefore > 0 ? salaryNow - salaryBefore : null,
    priceChanges: priceChanges(f),
    periodicPaid: cats
      .filter((c) => c.kind === 'periodic' && (spent.get(c.id) ?? 0) > 0)
      .map((c) => ({ name: c.name, cents: spent.get(c.id) ?? 0 })),
    jump: variable
      ? {
          name: variable.c.name,
          deltaCents: variable.d,
          previousMonthName: monthName(previousMonth),
        }
      : null,
    overPlan: topOver
      ? { count: plan.over.length, topName: topOver.name, topCents: topOver.overspentCents }
      : null,
  });

  const netWorth = availableSection(() => netWorthOf(db, f));
  const check = availableSection(() => checkOf(db, f));
  return {
    month,
    today,
    previousMonth,
    asOf: f.asOf,
    partial: f.partial,
    firstMonth: f.firstMonth,
    beforeRecords: month < f.firstMonth,
    result,
    capitalCents: income.capitalCents,
    incomeRows,
    allocation: alloc,
    netWorth,
    top,
    plan: { total: plan.total, overCount: plan.over.length, over: plan.over.slice(0, 4) },
    check,
    pace,
    findings,
  };
}
