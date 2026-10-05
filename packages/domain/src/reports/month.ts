import { ratioBp } from '../kpi/ratios';
import { householdIncomeCents } from '../overview/figures';
import type { BudgetClass } from '../ledger/alloc';

/**
 * Pure calculations of the report group "Monat und Einkommen" (1.1 Monats-One-Pager, 1.3
 * Einnahmen, 1.4 Geldfluss). The read models in `@budget/db` supply the facts of the ledger; the
 * figures are assembled here so that the three reports never compute the same number twice.
 * Port of `onepager`, `einnahmen` and `geldfluss` in `design/prototype/reports-monat.js`, with the
 * owner decision of 02.10.2026: Kapitalerträge (interest, dividends) are shown beside the
 * household income, never inside it; transfers, refunds and contact repayments are no income.
 * All money is integer cents.
 */

// ---------------------------------------------------------------------------------------------
// Income
// ---------------------------------------------------------------------------------------------

/** `earned`: household income. `capital`: Kapitalerträge, shown apart. `refund`: never income. */
export type IncomeKind = 'earned' | 'capital' | 'refund';

export interface IncomeFact {
  month: string;
  /** `null` = an income booking without an income type. */
  typeId: string | null;
  typeName: string;
  kind: IncomeKind;
  sortOrder: number;
  cents: number;
}

export interface IncomeByType {
  typeId: string | null;
  name: string;
  cents: number;
}

export interface MonthIncome {
  month: string;
  /** Household income by type, in list order, only types with money. */
  types: IncomeByType[];
  /** Household income: the sum of `types`. */
  earnedCents: number;
  /** Interest and dividends: not part of `earnedCents`. */
  capitalCents: number;
  /** Uncategorised refunds, booked as inflow: counted nowhere as income. */
  refundCents: number;
}

/** The income of one month from the income facts (a month without facts is returned empty). */
export function monthIncomeOf(facts: ReadonlyArray<IncomeFact>, month: string): MonthIncome {
  const types = new Map<string, IncomeByType & { sortOrder: number }>();
  let capitalCents = 0;
  let refundCents = 0;
  for (const f of facts) {
    if (f.month !== month || f.cents === 0) continue;
    if (f.kind === 'capital') capitalCents += f.cents;
    else if (f.kind === 'refund') refundCents += f.cents;
    else if (householdIncomeCents(f.cents, f.typeId, 'household') !== 0) {
      const key = f.typeId ?? '';
      const entry = types.get(key) ?? {
        typeId: f.typeId,
        name: f.typeName,
        cents: 0,
        sortOrder: f.sortOrder,
      };
      entry.cents += f.cents;
      types.set(key, entry);
    }
  }
  const list = [...types.values()]
    .filter((t) => t.cents !== 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map(({ typeId, name, cents }) => ({ typeId, name, cents }));
  return {
    month,
    types: list,
    earnedCents: list.reduce((a, t) => a + t.cents, 0),
    capitalCents,
    refundCents,
  };
}

export interface IncomeWindowRow {
  typeId: string | null;
  name: string;
  /** The selected (last) month. */
  monthCents: number;
  /** Per month of the window, oldest first. */
  perMonth: number[];
  sumCents: number;
  averageCents: number;
  /** Whole percent of the household income of the window; the rows add up to 100. */
  sharePercent: number;
}

export interface IncomeWindow {
  months: string[];
  rows: IncomeWindowRow[];
  totalCents: number;
  totalMonthCents: number;
  totalAverageCents: number;
  capital: { monthCents: number; perMonth: number[]; sumCents: number; averageCents: number };
}

/** Whole percentages of `values` that add up to exactly 100 (largest remainder); zeros for no sum. */
export function sharesOf(values: ReadonlyArray<number>): number[] {
  const total = values.reduce((a, v) => a + Math.max(0, v), 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map((v) => (Math.max(0, v) / total) * 100);
  const floors = exact.map(Math.floor);
  let missing = 100 - floors.reduce((a, v) => a + v, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (missing <= 0) break;
    floors[i] = (floors[i] as number) + 1;
    missing -= 1;
  }
  return floors;
}

/** Integer division rounding half away from zero. */
const roundDiv = (a: number, b: number): number =>
  b === 0 ? 0 : a < 0 ? -Math.floor((2 * -a + b) / (2 * b)) : Math.floor((2 * a + b) / (2 * b));

/** Income by type over the months of a window (the last 12 months, the prototype's "Nach Art"). */
export function incomeWindow(months: ReadonlyArray<MonthIncome>): IncomeWindow {
  const keys = new Map<string, { typeId: string | null; name: string }>();
  for (const m of months)
    for (const t of m.types)
      if (!keys.has(t.typeId ?? '')) keys.set(t.typeId ?? '', { typeId: t.typeId, name: t.name });
  const n = months.length;
  const last = months[n - 1];
  const rows: IncomeWindowRow[] = [...keys.entries()].map(([key, k]) => {
    const perMonth = months.map((m) => m.types.find((t) => (t.typeId ?? '') === key)?.cents ?? 0);
    const sumCents = perMonth.reduce((a, v) => a + v, 0);
    return {
      typeId: k.typeId,
      name: k.name,
      monthCents: perMonth[n - 1] ?? 0,
      perMonth,
      sumCents,
      averageCents: roundDiv(sumCents, n),
      sharePercent: 0,
    };
  });
  const shares = sharesOf(rows.map((r) => r.sumCents));
  rows.forEach((r, i) => (r.sharePercent = shares[i] ?? 0));
  const totalCents = rows.reduce((a, r) => a + r.sumCents, 0);
  const capitalPerMonth = months.map((m) => m.capitalCents);
  const capitalSum = capitalPerMonth.reduce((a, v) => a + v, 0);
  return {
    months: months.map((m) => m.month),
    rows,
    totalCents,
    totalMonthCents: last?.earnedCents ?? 0,
    totalAverageCents: roundDiv(totalCents, n),
    capital: {
      monthCents: last?.capitalCents ?? 0,
      perMonth: capitalPerMonth,
      sumCents: capitalSum,
      averageCents: roundDiv(capitalSum, n),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Expected against received
// ---------------------------------------------------------------------------------------------

/** `unlinked`: due, but the occurrence has not been materialised and matched yet. */
export type OccurrenceState = 'expected' | 'received' | 'deviating' | 'missed' | 'unlinked';
export type IncomeLineStatus =
  'ok' | 'pending' | 'diff' | 'missing' | 'overdue' | 'unplanned' | 'unlinked';

export interface ExpectedIncomeInput {
  paymentId: string;
  name: string;
  sub: string;
  typeId: string | null;
  dueDate: string;
  status: OccurrenceState;
  expectedCents: number;
  receivedCents: number;
}

export interface ExpectedIncomeLine {
  key: string;
  name: string;
  sub: string;
  typeId: string | null;
  /** `null` for income that arrived without an expected payment. */
  dueDate: string | null;
  status: IncomeLineStatus;
  expectedCents: number;
  receivedCents: number;
  /** Received minus expected; only meaningful for `diff`. */
  differenceCents: number;
}

export interface ExpectedIncome {
  lines: ExpectedIncomeLine[];
  /** Expected payments that are still ahead, with their sum. */
  pendingCount: number;
  pendingCents: number;
  /** Gaps: missed or overdue payments. */
  missingCount: number;
  /** Due payments that are not matched yet: nothing is known about their receipt. */
  unlinkedCount: number;
}

/** Status of one expected payment: a future payment is `pending`, a due one without booking a gap. */
export function incomeLineStatus(
  input: Pick<ExpectedIncomeInput, 'status' | 'dueDate'>,
  today: string,
): IncomeLineStatus {
  if (input.status === 'received') return 'ok';
  if (input.status === 'deviating') return 'diff';
  if (input.status === 'missed') return 'missing';
  if (input.status === 'unlinked') return input.dueDate > today ? 'pending' : 'unlinked';
  return input.dueDate > today ? 'pending' : 'overdue';
}

/**
 * Expected payments of the month against what arrived, plus income that no expected payment
 * explains (`unplanned`), so the table accounts for the whole household income. Payments of the
 * `capital` and `refund` kind are left out (`excludedTypeIds`): Kapitalerträge have their own
 * figure and refunds are no income.
 */
export function expectedIncome(input: {
  today: string;
  expected: ReadonlyArray<ExpectedIncomeInput>;
  /** Booked household income of the month (`MonthIncome.types`). */
  booked: ReadonlyArray<IncomeByType>;
  excludedTypeIds?: ReadonlySet<string>;
}): ExpectedIncome {
  const excluded = input.excludedTypeIds ?? new Set<string>();
  const lines: ExpectedIncomeLine[] = [];
  const linkedByType = new Map<string, number>();
  const unlinkedTypes = new Set<string>();
  for (const e of input.expected) {
    if (e.typeId !== null && excluded.has(e.typeId)) continue;
    const status = incomeLineStatus(e, input.today);
    const received = status === 'ok' || status === 'diff' ? e.receivedCents : 0;
    if (status === 'unlinked') unlinkedTypes.add(e.typeId ?? '');
    linkedByType.set(e.typeId ?? '', (linkedByType.get(e.typeId ?? '') ?? 0) + received);
    lines.push({
      key: `${e.paymentId}|${e.dueDate}`,
      name: e.name,
      sub: e.sub,
      typeId: e.typeId,
      dueDate: e.dueDate,
      status,
      expectedCents: e.expectedCents,
      receivedCents: received,
      differenceCents: received - e.expectedCents,
    });
  }
  for (const b of input.booked) {
    // Income of a type whose payments are not matched yet cannot be called unplanned.
    if (unlinkedTypes.has(b.typeId ?? '')) continue;
    const extra = b.cents - (linkedByType.get(b.typeId ?? '') ?? 0);
    if (extra <= 0) continue;
    lines.push({
      key: `unplanned|${b.typeId ?? ''}`,
      name: b.name,
      sub: 'ohne wiederkehrende Zahlung',
      typeId: b.typeId,
      dueDate: null,
      status: 'unplanned',
      expectedCents: 0,
      receivedCents: extra,
      differenceCents: extra,
    });
  }
  lines.sort(
    (a, b) =>
      (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') ||
      a.name.localeCompare(b.name),
  );
  const pending = lines.filter((l) => l.status === 'pending');
  return {
    lines,
    pendingCount: pending.length,
    pendingCents: pending.reduce((a, l) => a + l.expectedCents, 0),
    missingCount: lines.filter((l) => l.status === 'missing' || l.status === 'overdue').length,
    unlinkedCount: lines.filter((l) => l.status === 'unlinked').length,
  };
}

// ---------------------------------------------------------------------------------------------
// Month result: Gespart, Sparquote, Übrig
// ---------------------------------------------------------------------------------------------

export interface MonthResult {
  earnedCents: number;
  consumptionCents: number;
  futureCents: number;
  /** Einnahmen minus Konsum. */
  savedCents: number;
  /** Gespart minus Zukunft; negative = taken from savings ("Aus Guthaben"). */
  restCents: number;
  /** Gespart over Einnahmen in basis points; `null` without income. */
  savingsRateBp: number | null;
}

/** The one-pager's dimension chain. Household income only: Kapitalerträge stay out of the rate. */
export function monthResult(input: {
  earnedCents: number;
  consumptionCents: number;
  futureCents: number;
}): MonthResult {
  const savedCents = input.earnedCents - input.consumptionCents;
  return {
    ...input,
    savedCents,
    restCents: savedCents - input.futureCents,
    savingsRateBp: input.earnedCents > 0 ? ratioBp(savedCents, input.earnedCents) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Spending: largest categories, plan, revisions
// ---------------------------------------------------------------------------------------------

export interface SpendingFact {
  id: string;
  name: string;
  class: BudgetClass;
  kind: string;
  /** Spending of the month, positive; refunds net. */
  cents: number;
  previousCents: number;
}

export interface TopSpendingRow extends SpendingFact {
  deltaCents: number;
}

/** The largest Bedarf and Wunsch categories of the month with the change against the month before. */
export function topSpending(facts: ReadonlyArray<SpendingFact>, limit = 8): TopSpendingRow[] {
  return facts
    .filter((f) => f.class !== 'future' && f.cents > 0)
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((f) => ({ ...f, deltaCents: f.cents - f.previousCents }));
}

export interface PlanFact {
  id: string;
  name: string;
  /** Carry plus assigned: what the envelope may spend this month. */
  budgetedCents: number;
  spentCents: number;
  /** The month ended with the envelope below zero. */
  overspentCents: number;
}

export interface PlanSummary {
  /** Envelopes with a plan (money to spend) or spending. */
  total: number;
  over: PlanFact[];
}

/** Categories over plan, the most overspent first. A category counts when its envelope ended below zero. */
export function planSummary(facts: ReadonlyArray<PlanFact>): PlanSummary {
  const relevant = facts.filter((f) => f.budgetedCents > 0 || f.spentCents > 0);
  return {
    total: relevant.length,
    over: relevant
      .filter((f) => f.overspentCents > 0)
      .sort((a, b) => b.overspentCents - a.overspentCents || a.name.localeCompare(b.name)),
  };
}

export interface MonthFinding {
  /** What happened, German UI text. */
  text: string;
  /** Signed cents shown beside it. */
  cents: number;
  /** Optional unit suffix, e.g. `p. a.`. */
  suffix?: string;
  /** Rule of the rule book this finding relates to, or `null`. */
  rule: string | null;
}

export interface PriceChange {
  name: string;
  /** Yearly equivalent of the old and the new price. */
  oldYearlyCents: number;
  newYearlyCents: number;
  /** Monthly equivalents for the text. */
  oldMonthlyCents: number;
  newMonthlyCents: number;
}

/**
 * The "Revisionen des Monats": what changed or needs a look, most important first, at most
 * `limit`. Pure: the caller formats money for the text (`money`).
 */
export function monthFindings(input: {
  money: (cents: number) => string;
  /** The month is not over: expected income that is still ahead. */
  open: { day: string; pendingCents: number; pendingCount: number } | null;
  specialIncomeCents: number;
  salaryChangeCents: number | null;
  priceChanges: ReadonlyArray<PriceChange>;
  periodicPaid: ReadonlyArray<{ name: string; cents: number }>;
  jump: { name: string; deltaCents: number; previousMonthName: string } | null;
  overPlan: { count: number; topName: string; topCents: number } | null;
  limit?: number;
}): MonthFinding[] {
  const out: MonthFinding[] = [];
  if (input.open && input.open.pendingCount > 0)
    out.push({
      text: `Laufender Monat bis ${input.open.day}: ${
        input.open.pendingCount === 1
          ? 'eine erwartete Einnahme folgt'
          : `${input.open.pendingCount} erwartete Einnahmen folgen`
      }`,
      cents: input.open.pendingCents,
      rule: 'R04',
    });
  if (input.specialIncomeCents > 0)
    out.push({ text: 'Sonderzahlung eingegangen', cents: input.specialIncomeCents, rule: 'R12' });
  if (input.salaryChangeCents !== null && input.salaryChangeCents !== 0)
    out.push({
      text: 'Gehalt netto je Monat geändert',
      cents: input.salaryChangeCents,
      rule: null,
    });
  for (const p of input.priceChanges)
    out.push({
      text: `${p.name} ${p.newYearlyCents > p.oldYearlyCents ? 'teurer' : 'günstiger'}: ${input.money(p.oldMonthlyCents)} → ${input.money(p.newMonthlyCents)} je Monat`,
      cents: p.newYearlyCents - p.oldYearlyCents,
      suffix: 'p. a.',
      rule: 'R10',
    });
  for (const p of input.periodicPaid)
    out.push({ text: `${p.name} fällig, aus der Rücklage bezahlt`, cents: -p.cents, rule: 'R05' });
  if (input.jump && input.jump.deltaCents > 4_000)
    out.push({
      text: `${input.jump.name} über ${input.jump.previousMonthName}`,
      cents: input.jump.deltaCents,
      rule: null,
    });
  if (input.overPlan && input.overPlan.count > 0)
    out.push({
      text: `${input.overPlan.count} ${
        input.overPlan.count === 1 ? 'Kategorie' : 'Kategorien'
      } über Plan, am meisten ${input.overPlan.topName}`,
      cents: input.overPlan.topCents,
      rule: null,
    });
  return out.slice(0, input.limit ?? 5);
}

// ---------------------------------------------------------------------------------------------
// Geldfluss (Sankey)
// ---------------------------------------------------------------------------------------------

export type FlowTone = 'inc' | 'cap' | 'pool' | 'need' | 'want' | 'future' | 'rest';

export interface FlowNode {
  id: string;
  name: string;
  cents: number;
  tone: FlowTone;
}

export interface FlowLink {
  from: string;
  to: string;
  cents: number;
  tone: FlowTone;
  label: string;
}

export interface FlowClassInput {
  class: BudgetClass;
  /** Spending by category group, positive cents. */
  groups: ReadonlyArray<{ name: string; cents: number }>;
}

export interface FlowTableRow {
  /** `need` | `want` | `future`, or `rest` for the closing "Übrig" row. */
  class: BudgetClass | 'rest';
  name: string;
  cents: number;
  sharePercent: number;
}

export interface MoneyFlow {
  /** Household income. */
  earnedCents: number;
  capitalCents: number;
  /** Everything that flows: income, Kapitalerträge and, when more is spent, money from savings. */
  totalCents: number;
  /** Bedarf, Wunsch and Zukunft together. */
  spentCents: number;
  /** Income and Kapitalerträge minus spending; negative means taken from savings. */
  restCents: number;
  columns: { income: FlowNode[]; pool: FlowNode[]; classes: FlowNode[]; groups: FlowNode[] };
  links: FlowLink[];
  /** Stückliste des Flusses. */
  table: FlowTableRow[];
  /** Dimension chain: Einnahmen + Kapitalerträge − classes = Übrig / Aus Guthaben. */
  chain: Array<{ label: string; cents: number; op?: '+' | '-' | '='; result?: boolean }>;
}

const CLASS_ORDER: BudgetClass[] = ['need', 'want', 'future'];
export const CLASS_NAMES: Record<BudgetClass, string> = {
  need: 'Bedarf',
  want: 'Wunsch',
  future: 'Zukunft',
};
const WEITERE: Record<BudgetClass, string> = {
  need: 'Weiterer Bedarf',
  want: 'Weitere Wünsche',
  future: 'Weitere Zukunft',
};
/** Slivers below this share of the flow (3,5 %) are folded into one labelled node. */
const SLIVER_BP = 350;

/**
 * The Geldfluss of one or several months: every income type flows into one pool first (no
 * crossing bands), the pool feeds Bedarf, Wunsch, Zukunft and "Übrig", the classes split into
 * their groups. Kapitalerträge are a node of their own, labelled, and never folded away.
 * Transfers between own accounts are not part of it. Port of `R.geldfluss`.
 */
export function moneyFlow(input: {
  income: ReadonlyArray<IncomeByType>;
  capitalCents: number;
  classes: ReadonlyArray<FlowClassInput>;
}): MoneyFlow {
  const earned = input.income.filter((t) => t.cents > 0);
  const earnedCents = earned.reduce((a, t) => a + t.cents, 0);
  const capitalCents = Math.max(0, input.capitalCents);
  const classes = CLASS_ORDER.flatMap((c) => {
    const entry = input.classes.find((x) => x.class === c);
    const groups = (entry?.groups ?? []).filter((g) => g.cents > 0);
    const cents = groups.reduce((a, g) => a + g.cents, 0);
    return cents > 0 ? [{ class: c, cents, groups }] : [];
  });
  const spentCents = classes.reduce((a, c) => a + c.cents, 0);
  const poolCents = earnedCents + capitalCents;
  const restCents = poolCents - spentCents;
  const totalCents = Math.max(poolCents, spentCents);
  const isSliver = (cents: number) => totalCents > 0 && (cents * 10_000) / totalCents < SLIVER_BP;

  // Income column: slivers of household income fold into one node.
  const income: FlowNode[] = [];
  const slivers = earned.length > 1 ? earned.filter((t) => isSliver(t.cents)) : [];
  for (const t of earned)
    if (!slivers.includes(t))
      income.push({ id: `i:${t.typeId ?? ''}`, name: t.name, cents: t.cents, tone: 'inc' });
  const [onlySliver] = slivers;
  if (slivers.length === 1 && onlySliver)
    income.push({
      id: `i:${onlySliver.typeId ?? ''}`,
      name: onlySliver.name,
      cents: onlySliver.cents,
      tone: 'inc',
    });
  else if (slivers.length > 1)
    income.push({
      id: 'i:weitere',
      name: 'Weitere Einnahmen',
      cents: slivers.reduce((a, t) => a + t.cents, 0),
      tone: 'inc',
    });
  if (capitalCents > 0)
    income.push({ id: 'i:kapital', name: 'Kapitalerträge', cents: capitalCents, tone: 'cap' });
  if (restCents < 0)
    income.push({ id: 'i:guthaben', name: 'Aus Guthaben', cents: -restCents, tone: 'rest' });

  const pool: FlowNode[] =
    totalCents > 0
      ? [
          {
            id: 'pool',
            name: restCents < 0 ? 'Verfügbar' : 'Einnahmen',
            cents: totalCents,
            tone: 'pool',
          },
        ]
      : [];
  const classNodes: FlowNode[] = classes.map((c) => ({
    id: `c:${c.class}`,
    name: CLASS_NAMES[c.class],
    cents: c.cents,
    tone: c.class,
  }));
  if (restCents > 0)
    classNodes.push({ id: 'c:rest', name: 'Übrig', cents: restCents, tone: 'rest' });

  const groups: FlowNode[] = [];
  const links: FlowLink[] = [];
  for (const n of income)
    links.push({ from: n.id, to: 'pool', cents: n.cents, tone: n.tone, label: n.name });
  for (const n of classNodes)
    links.push({ from: 'pool', to: n.id, cents: n.cents, tone: n.tone, label: n.name });
  const rows: Array<Omit<FlowTableRow, 'sharePercent'>> = [];
  for (const c of classes) {
    const sorted = [...c.groups].sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
    const nodes: FlowNode[] = [];
    let small = 0;
    for (const g of sorted) {
      rows.push({ class: c.class, name: g.name, cents: g.cents });
      if (isSliver(g.cents)) small += g.cents;
      else
        nodes.push({ id: `g:${c.class}:${g.name}`, name: g.name, cents: g.cents, tone: c.class });
    }
    if (small > 0)
      nodes.push({
        id: `g:${c.class}:weitere`,
        name: WEITERE[c.class],
        cents: small,
        tone: c.class,
      });
    for (const n of nodes) {
      groups.push(n);
      links.push({
        from: `c:${c.class}`,
        to: n.id,
        cents: n.cents,
        tone: c.class,
        label: `${CLASS_NAMES[c.class]} → ${n.name}`,
      });
    }
  }
  if (restCents > 0) rows.push({ class: 'rest', name: 'Übrig', cents: restCents });
  const shares = sharesOf(rows.map((r) => r.cents));
  const table = rows.map((r, i): FlowTableRow => ({ ...r, sharePercent: shares[i] ?? 0 }));

  const chain: MoneyFlow['chain'] = [{ label: 'Einnahmen', cents: earnedCents }];
  if (capitalCents > 0) chain.push({ label: 'Kapitalerträge', cents: capitalCents, op: '+' });
  for (const c of classes) chain.push({ label: CLASS_NAMES[c.class], cents: c.cents, op: '-' });
  chain.push({
    label: restCents >= 0 ? 'Übrig' : 'Aus Guthaben',
    cents: restCents,
    op: '=',
    result: true,
  });

  return {
    earnedCents,
    capitalCents,
    totalCents,
    spentCents,
    restCents,
    columns: { income, pool, classes: classNodes, groups },
    links,
    table,
    chain,
  };
}
