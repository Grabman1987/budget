import {
  daysBetween,
  lastDayOfMonth,
  parseAmount,
  percentShares,
  waterfallFill,
} from '@budget/domain';
import { eur } from '../ledger/format';
import type { CategoryClass, CategoryKind } from './api';
import type { ExpectedPayment } from '../expected/api';
import type { BudgetMonthView, EnvelopeSummary, MonthSummary } from './budget-api';
import { STAGES } from './labels';

/**
 * View model of Plan › Monat (port of `design/prototype/plan.js`): rows, the five orderings,
 * rail and group status, waterfall suggestions and the pace bar. Every figure comes from the
 * budget API; this module only sorts, groups and words it.
 */

export type PlanView = 'stage' | 'time' | 'group' | 'class' | 'triage';

export interface PlanRow extends EnvelopeSummary {
  id: string;
  name: string;
  icon: string | null;
  cls: CategoryClass | null;
  kind: CategoryKind;
  stage: number | null;
  groupId: string;
  cardAccountId: string | null;
  /** Set by the "Zeit" ordering: the date this envelope counts under, and where it comes from. */
  due?: RowDue;
}

export interface RowDue {
  date: string;
  /** Expected payment (name, EUR amount) or the envelope's own target. */
  source: 'expected' | 'target';
  name?: string;
  amountCents?: number | null;
}

export interface PlanGroup {
  key: string;
  no: string;
  title: string;
  sub?: string;
  rows: PlanRow[];
  stage?: number;
  /** Short state of an empty group (rail, group line). */
  emptyText: string;
  /** Full calm sentence in the empty group's row; `emptyText` when absent. */
  emptyNote?: string;
}

export const CLASS_TEXT = { need: 'Bedarf', want: 'Wunsch', future: 'Zukunft' } as const;

/** Rows in list order; hidden categories only while they still hold or move money. */
export function planRows(view: BudgetMonthView): PlanRow[] {
  const byId = new Map(view.summary.envelopes.map((e) => [e.categoryId, e]));
  const groupOrder = new Map(view.groups.map((g, i) => [g.id, i]));
  return view.categories
    .filter((c) => {
      const e = byId.get(c.id);
      return e && (!c.hiddenAt || e.availableCents !== 0 || e.activityCents !== 0);
    })
    .sort(
      (a, b) =>
        (groupOrder.get(a.groupId) ?? 0) - (groupOrder.get(b.groupId) ?? 0) ||
        a.sortOrder - b.sortOrder,
    )
    .map((c) => ({
      ...byId.get(c.id)!,
      id: c.id,
      name: c.name,
      icon: c.icon,
      cls: c.class,
      kind: c.kind,
      stage: c.stage,
      groupId: c.groupId,
      cardAccountId: c.cardAccountId,
    }));
}

/** Cash overspending needs action (red); credit overspending is new card debt (blueprint). */
export const isCashOver = (r: PlanRow) => r.cashOverspentCents > 0;
export const isCard = (r: PlanRow) => r.kind === 'card_payment';

/** `day` of `month` as `YYYY-MM-DD`, clamped to the month's last day (31 → 30.04.). */
const dayIn = (month: string, day: number) =>
  `${month}-${String(Math.min(day, Number(lastDayOfMonth(month).slice(8)))).padStart(2, '0')}`;

/**
 * Due date of an envelope in `month` (`YYYY-MM-DD`), or null when it has no fixed date. A target
 * with a due month (by date, every n months) is due on its own day: `dueDay`, else the day of
 * `targetDate` (the rhythm repeats that day), not on the 1st.
 */
export function dueDate(r: PlanRow, month: string): string | null {
  const t = r.target;
  if (!t) return null;
  if (t.kind === 'monthly' && t.everyMonths === 1 && t.dueDay) return dayIn(month, t.dueDay);
  if (!r.dueMonth) return null;
  return dayIn(r.dueMonth, t.dueDay ?? (t.targetDate ? Number(t.targetDate.slice(8, 10)) : 1));
}

/**
 * Amount typed into an assign field. A leading + / − is a relative change ("+50" adds 50) only
 * when `relative`: the sign was the first thing typed into an emptied or fully selected field.
 * The pre-filled figure, or an edit inside it, is always absolute, so "−50,00" stays −50,00.
 * A result below 0 is refused, unless the envelope already holds a negative assignment and the
 * result does not go lower (it can be raised step by step). Null when unreadable or refused.
 */
export function readAssign(raw: string, current: number, relative: boolean): number | null {
  const text = raw.trim();
  const signed = relative && /^[+\-−]/.test(text);
  const parsed = parseAmount(signed ? text.slice(1) : text);
  if (!parsed.ok) return null;
  const value = signed
    ? current + (text.startsWith('+') ? parsed.cents : -parsed.cents)
    : parsed.cents;
  return value >= Math.min(0, current) ? value : null;
}

/**
 * The assignment guard on the client ("Schranken", the server enforces it with 422): raising the
 * month's assigned total beyond what "Zu verteilen" holds is refused. `value` is the new absolute
 * assignment of one envelope whose current one is `current`; a value that does not raise it always
 * passes. On refusal `maxCents` is the highest value that is still allowed.
 */
export function assignGuard(
  value: number,
  current: number,
  toBeAssignedCents: number,
): { ok: true } | { ok: false; maxCents: number; message: string } {
  const added = value - current;
  const free = Math.max(0, toBeAssignedCents);
  if (added <= free) return { ok: true };
  const maxCents = current + free;
  return {
    ok: false,
    maxCents,
    message:
      free > 0
        ? `So viel ist nicht frei: „Zu verteilen“ hat ${eur(toBeAssignedCents)}. Höchstens ${eur(maxCents)} zuweisen.`
        : `Es ist nichts frei: „Zu verteilen“ steht bei ${eur(toBeAssignedCents)}.`,
  };
}

/** The same guard for moving `amountCents` out of "Zu verteilen" into an envelope. */
export function moveGuard(
  amountCents: number,
  toBeAssignedCents: number,
): { ok: true } | { ok: false; maxCents: number; message: string } {
  const free = Math.max(0, toBeAssignedCents);
  if (amountCents <= free) return { ok: true };
  return {
    ok: false,
    maxCents: free,
    message:
      free > 0
        ? `So viel ist nicht frei: „Zu verteilen“ hat ${eur(toBeAssignedCents)}. Höchstens ${eur(free)} verschieben.`
        : `Es ist nichts frei: „Zu verteilen“ steht bei ${eur(toBeAssignedCents)}.`,
  };
}

/**
 * "Decken" from "Zu verteilen": `capCents` is what it can cover without going below 0; `short`
 * when that is less than the overspending (the rest needs `allowNegative`).
 */
export function coverFromToBeAssigned(overspentCents: number, toBeAssignedCents: number) {
  const capCents = Math.min(overspentCents, Math.max(0, toBeAssignedCents));
  return { capCents, short: capCents < overspentCents };
}

export interface PlanContext {
  month: string;
  /** Today (`YYYY-MM-DD`, Vienna). */
  today: string;
  cardName: (accountId: string | null) => string;
  /**
   * Expected outflows of the ledger with their next date; `undefined` while loading. The "Zeit"
   * ordering counts an envelope under the earliest one that points at it.
   */
  expected?: ReadonlyArray<ExpectedDue>;
}

export interface ExpectedDue {
  categoryId: string;
  name: string;
  /** Next due date `YYYY-MM-DD`. */
  date: string;
  /** Signed EUR cents; null for a foreign currency. */
  amountCents: number | null;
}

/** Live expected outflows with a next date and an envelope, as the "Zeit" ordering needs them. */
export function expectedDues(payments: ReadonlyArray<ExpectedPayment>): ExpectedDue[] {
  return payments
    .filter((p) => p.kind === 'outflow' && !p.deletedAt && p.categoryId && p.nextDueDate)
    .map((p) => ({
      categoryId: p.categoryId as string,
      name: p.name,
      date: p.nextDueDate as string,
      amountCents: p.version && p.version.currency === 'EUR' ? p.amountCents : null,
    }));
}

/** The groups of one ordering, each with its rows (card envelopes go to "Kreditkarten"). */
export function planGroups(
  view: PlanView,
  rows: PlanRow[],
  data: BudgetMonthView,
  ctx: PlanContext,
): PlanGroup[] {
  const cards = rows.filter(isCard);
  const budget = rows.filter((r) => !isCard(r));
  const cardGroup: PlanGroup[] = cards.length
    ? [
        {
          key: 'cards',
          no: 'K',
          title: 'Kreditkarten',
          sub: 'Kartenzahlung',
          rows: cards,
          emptyText: '',
        },
      ]
    : [];
  const numbered = (gs: Omit<PlanGroup, 'no'>[]) => gs.map((g, i) => ({ ...g, no: String(i + 1) }));
  if (view === 'stage') {
    const staged: PlanGroup[] = STAGES.map((s) => ({
      key: `s${s.n}`,
      no: String(s.n),
      title: s.name,
      stage: s.n,
      rows: budget.filter((r) => r.stage === s.n),
      emptyText: 'keine Posten',
      ...(s.n === 9 && {
        emptyNote: 'Keine günstigen Schulden. Was übrig bleibt, geht in Stufe 8.',
      }),
    }));
    const loose = budget.filter((r) => r.stage === null);
    const rest = loose.length
      ? [{ key: 'none', no: '–', title: 'Ohne Stufe', rows: loose, emptyText: '' }]
      : [];
    return [...cardGroup, ...staged, ...rest];
  }
  if (view === 'class') {
    const classes = numbered(
      (['need', 'want', 'future'] as const).map((k) => ({
        key: k,
        title: CLASS_TEXT[k],
        rows: budget.filter((r) => r.cls === k),
        emptyText: 'keine Posten',
      })),
    );
    const loose = budget.filter((r) => r.cls === null);
    return [
      ...cardGroup,
      ...classes,
      ...(loose.length
        ? [{ key: 'none', no: '–', title: 'Ohne Klasse', rows: loose, emptyText: '' }]
        : []),
    ];
  }
  if (view === 'group') {
    return numbered(
      data.groups
        .map((g) => ({
          key: g.id,
          title: g.name,
          rows: rows.filter((r) => r.groupId === g.id),
          emptyText: '',
        }))
        .filter((g) => g.rows.length > 0),
    );
  }
  if (view === 'time') return timeGroups(budget, ctx);
  return triageGroups(rows);
}

function timeGroups(rows: PlanRow[], ctx: PlanContext): PlanGroup[] {
  const d = (day: string) => day.slice(8, 10) + '.' + day.slice(5, 7) + '.';
  // The day the time view counts from: today in the current month, else the month's first day.
  const from = ctx.today.startsWith(ctx.month) ? ctx.today : `${ctx.month}-01`;
  const in14 = addDaysIso(from, 14);
  const [y, m] = ctx.month.split('-').map(Number) as [number, number];
  const endNext = lastDayOfMonth(
    `${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, '0')}`,
  );
  // Honest empty state: nothing is "not due" while no expected payment exists to say so.
  const none = ctx.expected && ctx.expected.length === 0;
  const emptyDated = none ? 'keine erwarteten Zahlungen erfasst' : 'nichts fällig';
  const emptyNote = none ? 'Keine erwarteten Zahlungen erfasst.' : undefined;
  const buckets: Omit<PlanGroup, 'no'>[] = [
    {
      key: 't14',
      title: 'Nächste 14 Tage',
      sub: `bis ${d(in14)}`,
      rows: [],
      emptyText: emptyDated,
      ...(emptyNote && { emptyNote }),
    },
    {
      key: 'tnext',
      title: 'Bis Ende nächsten Monats',
      sub: `bis ${d(endNext)}`,
      rows: [],
      emptyText: emptyDated,
      ...(emptyNote && { emptyNote }),
    },
    {
      key: 'tlater',
      title: 'Später',
      sub: 'mit Termin',
      rows: [],
      emptyText: emptyDated,
      ...(emptyNote && { emptyNote }),
    },
    {
      key: 'topen',
      title: 'Ohne festen Termin',
      sub: 'Sparen, Puffer, Tilgung',
      rows: [],
      emptyText: 'keine Posten',
    },
    {
      key: 'trun',
      title: 'Laufend',
      sub: 'variable Monatsbudgets',
      rows: [],
      emptyText: 'keine Posten',
    },
  ];
  // The earliest expected payment of an envelope sets its date; without one its own target does.
  const expected = new Map<string, ExpectedDue>();
  for (const e of ctx.expected ?? []) {
    const known = expected.get(e.categoryId);
    if (!known || e.date < known.date) expected.set(e.categoryId, e);
  }
  const dated = rows.map((r) => {
    const e = expected.get(r.id);
    if (e) {
      const due: RowDue = {
        date: e.date,
        source: 'expected',
        name: e.name,
        amountCents: e.amountCents,
      };
      return { r: { ...r, due }, date: e.date as string | null };
    }
    let date = dueDate(r, ctx.month);
    // A fixed cost already paid this month is due again next month.
    if (date && r.kind === 'fixed' && r.activityCents < 0) date = addMonthIso(date);
    return { r: date ? { ...r, due: { date, source: 'target' as const } } : r, date };
  });
  dated.sort((a, b) =>
    a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : 0,
  );
  for (const { r, date } of dated) {
    const hasExpected = r.due?.source === 'expected';
    if (r.kind === 'variable' && !hasExpected) buckets[4]!.rows.push(r);
    else if (!date) buckets[3]!.rows.push(r);
    else if (date <= in14) buckets[0]!.rows.push(r);
    else if (date <= endNext) buckets[1]!.rows.push(r);
    else buckets[2]!.rows.push(r);
  }
  return buckets.map((b, i) => ({ ...b, no: String(i + 1) }));
}

function triageGroups(rows: PlanRow[]): PlanGroup[] {
  const cash = rows.filter(isCashOver);
  const credit = rows.filter((r) => !isCashOver(r) && r.creditOverspentCents > 0);
  const dueShort = rows.filter(
    (r) =>
      !isCashOver(r) &&
      r.creditOverspentCents === 0 &&
      r.kind === 'fixed' &&
      r.activityCents === 0 &&
      r.needCents > 0,
  );
  const taken = new Set([...cash, ...credit, ...dueShort]);
  const missing = rows.filter((r) => !taken.has(r) && r.needCents > 0);
  const gs = [
    {
      key: 'xover',
      title: 'Überzogen',
      sub: 'aus einem anderen Envelope decken',
      rows: cash,
      emptyText: 'nichts überzogen',
      emptyNote: 'Nichts ist bar überzogen.',
    },
    {
      key: 'xcard',
      title: 'Neue Kartenschuld',
      sub: 'mit Karte über das Budget hinaus',
      rows: credit,
      emptyText: 'keine',
      emptyNote: 'Keine neue Kartenschuld.',
    },
    {
      key: 'xdue',
      title: 'Fällig, nicht gedeckt',
      sub: 'Rechnung kommt, Geld fehlt',
      rows: dueShort,
      emptyText: 'alles gedeckt',
      emptyNote: 'Alles, was fällig wird, ist gedeckt.',
    },
    {
      key: 'xmiss',
      title: 'Fehlt zum Ziel',
      sub: 'in Wasserfall-Reihenfolge',
      rows: missing,
      emptyText: 'alle Ziele erreicht',
      emptyNote: 'Alle Ziele sind erreicht.',
    },
  ];
  return gs.map((g, i) => ({ ...g, no: String(i + 1) }));
}

const addDaysIso = (day: string, n: number) => {
  const t = new Date(`${day}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const addMonthIso = (day: string) => {
  const t = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  t.setUTCMonth(t.getUTCMonth() + 1);
  const month = t.toISOString().slice(0, 7);
  const last = lastDayOfMonth(month);
  return `${month}-${day.slice(8) > last.slice(8) ? last.slice(8) : day.slice(8)}`;
};

export interface GroupStatus {
  assigned: number;
  activity: number;
  available: number;
  goal: number;
  need: number;
  cashOver: number;
  state: 'none' | 'over' | 'full' | 'part' | 'empty';
  /** 0…1: how much of the goals is assigned (rail fill). */
  fill: number;
}

export function groupStatus(rows: PlanRow[]): GroupStatus {
  const sum = (f: (r: PlanRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const assigned = sum((r) => r.assignedCents);
  const goal = sum((r) => r.goalCents);
  const need = sum((r) => r.needCents);
  const cashOver = rows.filter(isCashOver).length;
  const state = !rows.length
    ? 'none'
    : cashOver
      ? 'over'
      : need === 0
        ? 'full'
        : assigned > 0
          ? 'part'
          : 'empty';
  return {
    assigned,
    activity: sum((r) => r.activityCents),
    available: sum((r) => r.availableCents),
    goal,
    need,
    cashOver,
    state,
    fill: goal > 0 ? Math.min(1, Math.max(0, (goal - need) / goal)) : rows.length ? 1 : 0,
  };
}

/** Status text of a group or rail stage ("gedeckt", "fehlt 12,00 €", "1 überzogen"). */
export function statusText(g: PlanGroup, s: GroupStatus): string {
  if (!g.rows.length) return g.emptyText || 'keine Posten';
  if (s.cashOver) return `${s.cashOver} überzogen`;
  return s.need === 0 ? 'gedeckt' : `fehlt ${eur(s.need)}`;
}

/** Waterfall suggestions: what is left to distribute poured into the target needs. */
export function suggestions(rows: PlanRow[], toBeAssignedCents: number): Record<string, number> {
  return waterfallFill(
    rows
      .filter((r) => !isCard(r))
      .map((r, i) => ({ id: r.id, stage: r.stage, sortOrder: i, needCents: r.needCents })),
    toBeAssignedCents,
  );
}

/** Take back `amount` from the lowest stages first, bottom row first ("Zu viel zugewiesen"). */
export function unassignPlan(rows: PlanRow[], amount: number): Array<[string, number]> {
  const order = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.assignedCents > 0 && !isCard(r))
    .sort((a, b) => (b.r.stage ?? 10) - (a.r.stage ?? 10) || b.i - a.i);
  const plan: Array<[string, number]> = [];
  let left = amount;
  for (const { r } of order) {
    if (left <= 0) break;
    const take = Math.min(r.assignedCents, left);
    plan.push([r.id, take]);
    left -= take;
  }
  return plan;
}

/** Default source to cover an overspent envelope: a stage-2 Wunsch with enough money first. */
export function coverSource(rows: PlanRow[], target: PlanRow): PlanRow | undefined {
  const amount = target.overspentCents;
  const pool = rows.filter((r) => r.id !== target.id && !isCard(r) && r.availableCents > 0);
  const enough = pool.filter((r) => r.availableCents >= amount);
  const rank = (r: PlanRow) => (r.stage === 2 ? 0 : 1) + (r.cls === 'want' ? 0 : 0.5);
  enough.sort((a, b) => rank(a) - rank(b) || b.availableCents - a.availableCents);
  return enough[0] ?? [...pool].sort((a, b) => b.availableCents - a.availableCents)[0];
}

export interface Bar {
  /** Share of the bar filled (0…1); null: no bar, only the line of text. */
  fill: number | null;
  over: boolean;
  /** Pace mark (share of the month gone) for spending envelopes in the current month. */
  pace: number | null;
  goalMark: boolean;
  meta: string;
  icon: 'check' | 'clock' | null;
}

/** Pace bar and line under a row (prototype `barFor`). */
export function barFor(r: PlanRow, ctx: PlanContext): Bar {
  const t = r.target;
  const base = r.carryCents + r.assignedCents;
  if (isCard(r)) {
    return {
      fill: null,
      over: false,
      pace: null,
      goalMark: false,
      icon: null,
      meta: `Kartenzahlung · ${ctx.cardName(r.cardAccountId)}`,
    };
  }
  if (r.kind === 'variable') {
    const spent = -r.activityCents;
    const inMonth = ctx.today.slice(0, 7) === ctx.month;
    const days = Number(lastDayOfMonth(ctx.month).slice(8));
    const pace = inMonth ? (daysBetween(`${ctx.month}-01`, ctx.today) + 1) / days : null;
    const fill = base > 0 ? Math.min(1, Math.max(0, spent / base)) : spent > 0 ? 1 : 0;
    const credit = r.creditOverspentCents > 0 && !isCashOver(r);
    const meta = isCashOver(r)
      ? `${eur(spent)} von ${eur(base)} · ${eur(r.cashOverspentCents)} überzogen`
      : credit
        ? `${eur(spent)} von ${eur(base)} · neue Kartenschuld ${eur(r.creditOverspentCents)}`
        : spent > 0 || inMonth
          ? `${eur(spent)} von ${eur(base)} ausgegeben${pace !== null && fill > pace + 0.08 ? ' · über Pace' : ''}`
          : t
            ? `Ziel ${eur(t.amountCents)} verfügbar${r.carryCents > 0 ? ` · Übertrag ${eur(r.carryCents)}` : ''}`
            : '';
    return { fill, over: isCashOver(r), pace, goalMark: false, icon: null, meta };
  }
  if (!t) return { fill: null, over: false, pace: null, goalMark: false, icon: null, meta: '' };
  if (r.kind === 'fixed' && t.kind === 'monthly' && t.everyMonths === 1 && t.dueDay) {
    const day = String(t.dueDay).padStart(2, '0');
    const paid = r.activityCents < 0;
    return {
      fill: null,
      over: false,
      pace: null,
      goalMark: false,
      icon: paid ? 'check' : 'clock',
      meta: paid ? `bezahlt · nächste am ${day}.` : `fällig am ${day}.`,
    };
  }
  const total = t.amountCents;
  const have = t.kind === 'monthly' && t.everyMonths === 1 ? r.assignedCents : base;
  const fill = total > 0 ? Math.min(1, Math.max(0, have / total)) : 0;
  const due = r.dueMonth ? ` · bis ${r.dueMonth.slice(5)}.${r.dueMonth.slice(0, 4)}` : '';
  const gap = Math.max(0, total - have);
  const meta =
    t.kind === 'keep_balance'
      ? `${eur(have)} von ${eur(total)} · Guthaben halten`
      : `${eur(have)} von ${eur(total)}${due}${gap > 0 && !due ? ` · fehlt ${eur(gap)}` : ''}`;
  return { fill, over: false, pace: null, goalMark: true, icon: null, meta };
}

export interface StatusLine {
  tone: 'bad' | 'warn' | 'good';
  text: string;
}

/**
 * The inspector's status of the month, every line that applies, worst first: too much assigned,
 * uncovered overspending carried from the previous month, cash-overspent envelopes, new card debt.
 * Only when none applies is the month calm; the line never says "nothing" while another says so.
 */
export function monthStatus(summary: MonthSummary, rows: PlanRow[]): StatusLine[] {
  const lines: StatusLine[] = [];
  const tba = summary.toBeAssignedCents;
  if (tba < 0) lines.push({ tone: 'bad', text: `Zu viel zugewiesen: ${eur(-tba)} fehlen` });
  if (summary.uncoveredCents > 0)
    lines.push({
      tone: 'bad',
      text: `Ungedeckt aus dem Vormonat: ${eur(summary.uncoveredCents)}`,
    });
  const over = rows.filter(isCashOver).length;
  if (over > 0)
    lines.push({
      tone: 'bad',
      text: `${over} ${over === 1 ? 'Envelope' : 'Envelopes'} bar überzogen`,
    });
  const credit = rows.filter((r) => !isCashOver(r) && r.creditOverspentCents > 0).length;
  if (credit > 0)
    lines.push({
      tone: 'warn',
      text: `${credit === 1 ? 'Eine neue Kartenschuld' : `${credit} neue Kartenschulden`} (Karte über das Envelope)`,
    });
  if (!lines.length) lines.push({ tone: 'good', text: 'Nichts ist überzogen.' });
  return lines;
}

export type SplitState =
  | { kind: 'shares'; need: number; want: number; future: number }
  | { kind: 'empty' }
  | { kind: 'no-income' }
  | { kind: 'too-much' };

/**
 * The 50/30/20 shares of what is assigned, against the month's income. They only mean something
 * with an income above 0 and no more assigned than that: otherwise (tiny income, carried money
 * assigned) the shares would read 5129 % or −861 %, so there are none and `kind` says why. Negative
 * class sums count as 0; every share is within 0…100 and the bar needs no clamping.
 */
export function splitState(summary: MonthSummary, rows: PlanRow[]): SplitState {
  const by = { need: 0, want: 0, future: 0 };
  for (const r of rows) if (r.cls) by[r.cls] += Math.max(0, r.assignedCents);
  const total = by.need + by.want + by.future;
  if (summary.incomeCents <= 0) return { kind: 'no-income' };
  if (total === 0) return { kind: 'empty' };
  if (total > summary.incomeCents) return { kind: 'too-much' };
  const shares = percentShares({
    needCents: by.need,
    wantCents: by.want,
    futureCents: by.future,
    incomeCents: summary.incomeCents,
  });
  return { kind: 'shares', need: shares.need, want: shares.want, future: shares.future };
}

/** One envelope across the visible months: `cells[i]` is its row in month `i`, absent when hidden. */
export interface MultiRow {
  id: string;
  name: string;
  icon: string | null;
  cls: CategoryClass | null;
  cells: Array<PlanRow | undefined>;
}

export interface MultiGroup {
  key: string;
  no: string;
  title: string;
  rows: MultiRow[];
}

/**
 * Plan › Monat with several months side by side: the envelopes grouped as in the "Gruppen" view,
 * in the order of the leftmost month. An envelope shows when at least one month lists it (hidden
 * categories only while they still hold or move money); months that do not list it have no cell.
 */
export function planMulti(views: BudgetMonthView[]): MultiGroup[] {
  const first = views[0];
  if (!first) return [];
  const perMonth = views.map((v) => new Map(planRows(v).map((r) => [r.id, r])));
  const groupOrder = new Map(first.groups.map((g, i) => [g.id, i]));
  const categories = first.categories
    .filter((c) => perMonth.some((m) => m.has(c.id)))
    .sort(
      (a, b) =>
        (groupOrder.get(a.groupId) ?? 0) - (groupOrder.get(b.groupId) ?? 0) ||
        a.sortOrder - b.sortOrder,
    );
  const groups = first.groups
    .map((g) => ({
      key: g.id,
      title: g.name,
      rows: categories
        .filter((c) => c.groupId === g.id)
        .map((c) => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
          cls: c.class,
          cells: perMonth.map((m) => m.get(c.id)),
        })),
    }))
    .filter((g) => g.rows.length > 0);
  return groups.map((g, i) => ({ ...g, no: String(i + 1) }));
}

/** The rows of one month column of a group, for `groupStatus` and the sums. */
export const monthCells = (rows: MultiRow[], index: number): PlanRow[] =>
  rows.flatMap((r) => r.cells[index] ?? []);
