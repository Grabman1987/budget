import {
  activeGoalAuditEntries,
  goalLifecycle,
  todayInVienna,
  type GoalLifecycle,
  type GoalLifecyclePoint,
} from '@budget/domain';
import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { SYSTEM_PAYEE_IDS } from '../schema';
import { budgetInputFromRows, type BudgetLedgerRows } from './budget-ledger-input';
import { budgetActivityOfLedger, budgetOfLedger } from './queries';
import type { Executor } from './types';

/** Read-only evidence. Limits reject a proof; they never turn a truncated audit into history. */
const MAX_ROWS = 20000;
const MAX_AUDIT = 30000;
const MAX_GROUPS = 1500;
const fields = {
  account: ['id', 'on_budget', 'opening_balance_cents', 'opening_date', 'deleted_at'],
  category: ['id', 'name', 'class', 'kind', 'rollover_overspending', 'card_account_id', 'opening_available_cents', 'deleted_at'],
  booking: ['id', 'account_id', 'date', 'income_next_month', 'payee_id', 'status', 'transfer_id', 'deleted_at'],
  booking_split: ['id', 'booking_id', 'category_id', 'amount_cents', 'transfer_id'],
  envelope_month: ['category_id', 'month', 'assigned_cents', 'deleted_at'],
  budget_month: ['month', 'held_cents', 'deleted_at'],
} as const;
type Table = keyof typeof fields;
type Row = Record<string, unknown>;
type State = Map<Table, Map<string, Row>>;
interface Entry {
  id: string;
  sequence: number;
  undoOfId: string | null;
  group: string | null;
  day: string;
  table: string;
  key: string;
  before: Row | null;
  after: Row | null;
}
export interface GoalAnchorIntent {
  id: string;
  categoryId: string | null;
  accountId: string | null;
  startMonth: string;
  targetCents: number;
  targetDate: string | null;
}
export interface GoalLifecycleSource extends GoalAnchorIntent {
  lifecycleAnchorJson: string | null;
  currentAvailableCents: number;
  /** Explicit Vienna calendar day, not a UTC timestamp prefix. */
  manualCompletedOn: string | null;
}

const tables = Object.keys(fields) as Table[];
const isTable = (table: string): table is Table => tables.includes(table as Table);
const text = (row: Row, key: string): string => {
  if (typeof row[key] !== 'string') throw new Error('Incomplete goal evidence');
  return row[key];
};
const nullable = (row: Row, key: string): string | null => row[key] === null ? null : text(row, key);
const cents = (row: Row, key: string): number => {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('Incomplete goal evidence');
  return value;
};
const keyOf = (table: Table, row: Row) => table === 'envelope_month'
  ? `${text(row, 'category_id')}:${text(row, 'month')}`
  : text(row, table === 'budget_month' ? 'month' : 'id');

/** Deleted retained rows are absent from the canonical live ledger. No private columns leave here. */
function project(table: Table, row: Row | null): Row | null {
  if (row === null) return null;
  if ('deleted_at' in row && row.deleted_at !== null) return null;
  const result: Row = {};
  for (const key of fields[table]) {
    if (!(key in row)) throw new Error('Incomplete goal evidence');
    const value = row[key];
    result[key] = typeof value === 'boolean' ? Number(value) : value;
  }
  return result;
}
const same = (a: Row | null, b: Row | null) => JSON.stringify(a) === JSON.stringify(b);
function apply(state: State, entry: Entry, reverse: boolean): void {
  if (!isTable(entry.table)) return;
  const table = state.get(entry.table)!;
  const from = project(entry.table, reverse ? entry.after : entry.before);
  const to = project(entry.table, reverse ? entry.before : entry.after);
  if (!same(table.get(entry.key) ?? null, from)) throw new Error('Incoherent goal evidence');
  if (to === null) table.delete(entry.key);
  else {
    if (keyOf(entry.table, to) !== entry.key) throw new Error('Incoherent goal evidence');
    table.set(entry.key, to);
  }
}
function fingerprint(state: State): string {
  return JSON.stringify(tables.map((t) => [...state.get(t)!].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
}
function ledger(state: State) {
  const values = (table: Table) => [...state.get(table)!.values()];
  const accounts: BudgetLedgerRows['accounts'] = values('account').map((r) => ({
    id: text(r, 'id'), onBudget: cents(r, 'on_budget') === 1,
    openingBalanceCents: cents(r, 'opening_balance_cents'), openingDate: text(r, 'opening_date'),
  }));
  const categories: BudgetLedgerRows['categories'] = values('category').map((r) => ({
    id: text(r, 'id'), name: text(r, 'name'),
    class: nullable(r, 'class') as BudgetLedgerRows['categories'][number]['class'],
    kind: text(r, 'kind') as BudgetLedgerRows['categories'][number]['kind'],
    rolloverOverspending: cents(r, 'rollover_overspending') === 1,
    cardAccountId: nullable(r, 'card_account_id'),
    openingAvailableCents: cents(r, 'opening_available_cents'),
  }));
  const rows: BudgetLedgerRows['rows'] = [];
  for (const r of values('booking_split')) {
    const b = state.get('booking')!.get(text(r, 'booking_id'));
    if (!b || !state.get('account')!.has(text(b, 'account_id'))) continue;
    rows.push({
      bookingId: text(b, 'id'), splitId: text(r, 'id'), payeeId: nullable(b, 'payee_id'),
      status: text(b, 'status'), accountId: text(b, 'account_id'), date: text(b, 'date'),
      incomeNextMonth: cents(b, 'income_next_month') === 1, amountCents: cents(r, 'amount_cents'),
      categoryId: nullable(r, 'category_id'), bookingTransferId: nullable(b, 'transfer_id'),
      splitTransferId: nullable(r, 'transfer_id'),
    });
  }
  const assigned: Record<string, Record<string, number>> = {};
  for (const r of values('envelope_month'))
    (assigned[text(r, 'month')] ??= {})[text(r, 'category_id')] = cents(r, 'assigned_cents');
  const held = Object.fromEntries(values('budget_month').map((r) => [text(r, 'month'), cents(r, 'held_cents')]));
  return budgetInputFromRows({ accounts, categories, rows, assigned, held });
}
function loadState(db: Executor): State {
  const state: State = new Map();
  for (const table of tables) {
    const rows = db.all<Row>(sql.raw(`SELECT ${fields[table].join(', ')} FROM ${table} LIMIT ${MAX_ROWS + 1}`));
    if (rows.length > MAX_ROWS) throw new Error('Goal evidence bound exceeded');
    state.set(table, new Map(rows.flatMap((r) => {
      const projected = project(table, r);
      return projected ? [[keyOf(table, projected), projected] as const] : [];
    })));
  }
  return state;
}
function readEntries(db: Executor, after = 0): Entry[] {
  return parseEntries(db.all<Row>(sql`SELECT rowid AS sequence, id, ts, entity_type, entity_id,
    before_json, after_json, group_id, undo_of_id FROM audit_log WHERE rowid > ${after} ORDER BY rowid LIMIT ${MAX_AUDIT + 1}`));
}
function parseEntries(raw: Row[]): Entry[] {
  if (raw.length > MAX_AUDIT) throw new Error('Goal evidence bound exceeded');
  const snapshot = (value: unknown): Row | null => {
    if (value === null) return null;
    if (typeof value !== 'string') throw new Error('Incomplete goal evidence');
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Incomplete goal evidence');
    return parsed as Row;
  };
  const entries = raw.map((r): Entry => {
    const ts = new Date(text(r, 'ts'));
    if (!Number.isFinite(ts.getTime())) throw new Error('Incomplete goal evidence');
    return {
      id: text(r, 'id'), sequence: cents(r, 'sequence'), undoOfId: nullable(r, 'undo_of_id'),
      group: nullable(r, 'group_id'), day: todayInVienna(ts), table: text(r, 'entity_type'),
      key: text(r, 'entity_id'), before: snapshot(r.before_json), after: snapshot(r.after_json),
    };
  });
  return entries;
}

/** No GET writes, no guessed history, and no independently implemented balance arithmetic. */
function replayLifecycles(db: Executor, goals: readonly GoalLifecycleSource[], asOf: string, anchor: GoalAnchor | null = null): Map<string, GoalLifecycle> {
  const fallback = () => new Map(goals.map((goal) => [goal.id, goalLifecycle({
    ...goal, asOf, manualCompletedOn: goal.manualCompletedOn, points: [], complete: false,
  })]));
  if (goals.every((goal) => goal.categoryId === null || goal.manualCompletedOn !== null)) return fallback();
  try {
    const state = loadState(db);
    const entries = readEntries(db, anchor?.auditWatermark ?? 0);
    const links = anchor ? anchoredAncestry(db, entries, anchor.auditWatermark) : entries;
    const active = activeGoalAuditEntries(links);
    if (!active) return fallback();
    const current = fingerprint(state);
    const finalLedger = ledger(state);
    // Final surviving signatures prevent an edited/deleted historical expense from completing a goal.
    // Confirmation changes status, not the economic expense; canonical budget includes both.
    const economicSignature = (split: typeof finalLedger.splits[number]) => JSON.stringify({ ...split, status: undefined });
    const surviving = new Map(finalLedger.splits.map((split) => [split.splitId, economicSignature(split)]));
    for (const entry of [...entries].reverse()) apply(state, entry, true);
    // A round-trip alone cannot date unaudited initial funding. This proof requires an evidenced
    // creation chain for every projected source row; legacy initial states remain unavailable.
    let anchorPoint: GoalLifecyclePoint | null = null;
    if (anchor) {
      if (goals.length !== 1 || !active || !validAnchorWitness(db, goals[0]!, anchor, entries, active, asOf)) return fallback();
      if (digest(fingerprint(state)) !== anchor.sourceFingerprint) return fallback();
      const amount = budgetOfLedger(ledger(state), [anchor.capturedOn.slice(0, 7)], { asOf: anchor.capturedOn })[0]?.envelopes[goals[0]!.categoryId!]?.availableCents ?? 0;
      if (amount !== anchor.availableCents) return fallback();
      const witness = entries.find((entry) => entry.group === anchor.groupId && entry.table === 'savings_goal' && entry.key === goals[0]!.id && entry.undoOfId === null && entry.after?.lifecycle_anchor_json === goals[0]!.lifecycleAnchorJson)!;
      anchorPoint = { sequence: witness.sequence, day: anchor.capturedOn, availableCents: amount, expenses: [] };
    } else if (tables.some((table) => state.get(table)!.size !== 0)) return fallback();
    const groups: Entry[][] = [];
    const seen = new Set<string>();
    for (const entry of entries) {
      const key = entry.group ?? entry.id;
      const previous = groups.at(-1);
      if (!previous || (previous[0]!.group ?? previous[0]!.id) !== key) {
        if (seen.has(key)) return fallback();
        seen.add(key);
        groups.push([entry]);
      } else previous.push(entry);
    }
    if (groups.length > MAX_GROUPS) return fallback();
    // Bound work before projecting history, including pathological account opening spans.
    const firstMonth = finalLedger.accounts.filter((account) => account.onBudget)
      .map((account) => account.openingDate.slice(0, 7)).sort()[0] ?? asOf.slice(0, 7);
    const monthSpan = (Number(asOf.slice(0, 4)) - Number(firstMonth.slice(0, 4))) * 12
      + Number(asOf.slice(5, 7)) - Number(firstMonth.slice(5, 7)) + 1;
    if (monthSpan > 1200 || groups.length * Math.max(1, finalLedger.splits.length) * Math.max(1, monthSpan) * Math.max(1, goals.length) > 2000000)
      return fallback();
    const points = new Map(goals.map((goal) => [goal.id, anchorPoint ? [anchorPoint] : [] as GoalLifecyclePoint[]]));
    const excludedPayees = new Set<string>(Object.values(SYSTEM_PAYEE_IDS).map((payee) => payee.id));
    for (const group of groups) {
      // Undo/Redo entries only select surviving originals; they are never replayed as new expenses.
      const originals = group.filter((entry) => entry.undoOfId === null);
      const enabled = originals.filter((entry) => active.has(entry.id));
      if (enabled.length === 0) continue;
      if (enabled.length !== originals.length || enabled.length !== group.length) return fallback();
      if (new Set(enabled.map((entry) => entry.day)).size !== 1) return fallback();
      for (const entry of enabled) apply(state, entry, false);
      if (!enabled.some((entry) => isTable(entry.table))) continue;
      const source = ledger(state);
      const day = enabled.at(-1)!.day;
      if (day > asOf) {
        if (enabled.some((entry) => entry.table === 'booking' || entry.table === 'booking_split' || entry.table === 'envelope_month')) return fallback();
        continue;
      }
      const month = day.slice(0, 7);
      const amounts = budgetOfLedger(source, [month], { asOf: day })[0]?.envelopes ?? {};
      const newBookings = new Set(enabled.filter((entry) => entry.table === 'booking' && entry.before === null && entry.after !== null).map((entry) => entry.key));
      // Pre-entered future expenses have no later committed source boundary in this replay.
      // Do not silently present their incomplete chronology as proven.
      if (source.splits.some((split) => newBookings.has(split.bookingId ?? '') && split.amountCents < 0 && split.date > day && split.date <= asOf)) return fallback();
      const created = new Set(enabled.filter((entry) => entry.table === 'booking_split' && entry.before === null && entry.after !== null).map((entry) => entry.key));
      const candidateSplits = source.splits.filter((split) => split.bookingId && split.splitId &&
        newBookings.has(split.bookingId) && created.has(split.splitId) && split.amountCents < 0 &&
        split.transferAccountId === null && state.get('booking')!.get(split.bookingId)?.transfer_id === null &&
        state.get('booking_split')!.get(split.splitId)?.transfer_id === null && !excludedPayees.has(split.payeeId ?? '') &&
        split.date <= asOf && surviving.get(split.splitId) === economicSignature(split));
      const candidateIds = new Set(candidateSplits.map((split) => split.splitId));
      const expenseMonths = [...new Set(candidateSplits.map((split) => split.date.slice(0, 7)))];
      const actualSource = { ...source, splits: source.splits.filter((split) => split.date <= asOf) };
      for (const goal of goals) {
        if (goal.categoryId === null || month < goal.startMonth) continue;
        // Financial month, not audit insertion month: a later-entered receipt retains its real date.
        const expenses = expenseMonths.flatMap((expenseMonth) =>
          budgetActivityOfLedger(actualSource, expenseMonth, goal.categoryId!).items
            .filter((item) => item.kind === 'booking' && item.cents < 0 && item.splitId && item.bookingId && item.date && candidateIds.has(item.splitId))
            .map((item) => ({ bookingId: item.bookingId!, splitId: item.splitId!, day: item.date! })))
          .sort((a, b) => a.day.localeCompare(b.day) || a.splitId.localeCompare(b.splitId));
        points.get(goal.id)!.push({
          sequence: enabled.at(-1)!.sequence, day, availableCents: amounts[goal.categoryId]?.availableCents ?? 0,
          expenses,
        });
      }
    }
    if (fingerprint(state) !== current) return fallback();
    return new Map(goals.map((goal) => [goal.id, goalLifecycle({
      ...goal, asOf, manualCompletedOn: goal.manualCompletedOn, points: points.get(goal.id)!,
      complete: goal.categoryId !== null,
    })]));
  } catch {
    // Corrupt/legacy/over-bound evidence is unavailable, not completion or an alternative balance.
    return fallback();
  }
}

interface GoalAnchor {
  version: 1;
  goalId: string;
  nonce: string;
  groupId: string;
  intentDigest: string;
  capturedOn: string;
  auditWatermark: number;
  sourceFingerprint: string;
  availableCents: number;
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** Economic intent only: equal patches and unrelated labels do not restart a prospective proof. */
export function goalAnchorIntentDigest(goal: GoalAnchorIntent): string {
  return digest(JSON.stringify({
    id: goal.id,
    sourceKind: goal.categoryId !== null ? 'category' : goal.accountId !== null ? 'account' : 'none',
    sourceId: goal.categoryId ?? goal.accountId,
    threshold: goal.targetCents, targetDate: goal.targetDate, startMonth: goal.startMonth,
  }));
}
const validDay = (value: unknown): value is string => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

function parseAnchor(raw: string): GoalAnchor | null {
  if (raw.length > 2048) return null;
  try {
    const a = JSON.parse(raw) as Partial<GoalAnchor> | null;
    if (!a || typeof a !== 'object' || a.version !== 1 ||
      typeof a.goalId !== 'string' || typeof a.nonce !== 'string' || typeof a.groupId !== 'string' ||
      !a.goalId || !a.groupId || !a.nonce || !validDay(a.capturedOn) ||
      typeof a.intentDigest !== 'string' || !/^[a-f0-9]{64}$/.test(a.intentDigest) ||
      typeof a.sourceFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(a.sourceFingerprint) ||
      typeof a.auditWatermark !== 'number' || !Number.isSafeInteger(a.auditWatermark) || a.auditWatermark < 0 ||
      typeof a.availableCents !== 'number' || !Number.isSafeInteger(a.availableCents)) return null;
    return a as GoalAnchor;
  } catch { return null; }
}

/** Called only by the existing authenticated goal writer, in its transaction and audit group. */
export function captureGoalAnchor(db: Executor, goal: GoalAnchorIntent, today: string, groupId: string): string | null {
  if (goal.categoryId === null || goal.accountId !== null || !validDay(today)) return null;
  try {
    const state = loadState(db);
    const source = ledger(state);
    const earliest = source.accounts.filter((a) => a.onBudget).map((a) => a.openingDate).sort()[0] ?? today;
    if (Number(today.slice(0, 4)) - Number(earliest.slice(0, 4)) > 100) return null;
    const availableCents = budgetOfLedger(source, [today.slice(0, 7)], { asOf: today })[0]?.envelopes[goal.categoryId]?.availableCents;
    if (availableCents === undefined || !Number.isSafeInteger(availableCents)) return null;
    const auditWatermark = db.get<{ n: number }>(sql`SELECT coalesce(max(rowid),0) AS n FROM audit_log`)!.n;
    if (!Number.isSafeInteger(auditWatermark)) return null;
    const anchor: GoalAnchor = {
      version: 1, goalId: goal.id, nonce: randomUUID(), groupId,
      intentDigest: goalAnchorIntentDigest(goal), capturedOn: today, auditWatermark,
      sourceFingerprint: digest(fingerprint(state)), availableCents,
    };
    return JSON.stringify(anchor);
  } catch {
    // A goal may be saved without automatic evidence; no false historical basis is persisted.
    return null;
  }
}

/** Only nonfinancial ancestry may cross the anchor. Earlier money reversals invalidate its basis. */
function anchoredAncestry(db: Executor, entries: Entry[], watermark: number): Entry[] {
  const known = new Map(entries.map((entry) => [entry.id, entry]));
  let frontier = entries;
  let expanded = 0;
  while (frontier.length) {
    const missing = [...new Set(frontier.flatMap((entry) => entry.undoOfId && !known.has(entry.undoOfId) ? [entry.undoOfId] : []))];
    if (!missing.length) break;
    expanded += missing.length;
    if (expanded > 256) throw new Error('Goal ancestry bound exceeded');
    const ancestors = parseEntries(db.all<Row>(sql`SELECT rowid AS sequence, id, ts, entity_type, entity_id,
      before_json, after_json, group_id, undo_of_id FROM audit_log
      WHERE id IN (${sql.join(missing.map((id) => sql`${id}`), sql`, `)}) ORDER BY rowid LIMIT 257`));
    if (ancestors.length !== missing.length || ancestors.some((entry) => entry.sequence > watermark || isTable(entry.table)))
      throw new Error('Unproven pre-anchor ancestry');
    for (const entry of ancestors) known.set(entry.id, entry);
    frontier = ancestors;
  }
  return [...known.values()].sort((a, b) => a.sequence - b.sequence);
}

function validAnchorWitness(db: Executor, goal: GoalLifecycleSource, anchor: GoalAnchor, entries: Entry[], active: Set<string>, asOf: string): boolean {
  if (anchor.goalId !== goal.id || anchor.intentDigest !== goalAnchorIntentDigest(goal) || anchor.capturedOn > asOf) return false;
  const witness = entries.find((entry) => entry.group === anchor.groupId && entry.table === 'savings_goal' && entry.key === goal.id &&
    entry.undoOfId === null && entry.after?.lifecycle_anchor_json === goal.lifecycleAnchorJson && entry.before?.lifecycle_anchor_json !== goal.lifecycleAnchorJson);
  if (!witness || !active.has(witness.id) || witness.sequence <= anchor.auditWatermark || !witness.after) return false;
  const after = witness.after;
  const witnessedIntent: GoalAnchorIntent = {
    id: text(after, 'id'), categoryId: nullable(after, 'category_id'), accountId: nullable(after, 'account_id'),
    targetCents: cents(after, 'target_cents'), targetDate: nullable(after, 'target_date'),
    startMonth: nullable(after, 'start_month') ?? text(after, 'created_at').slice(0, 7),
  };
  if (goalAnchorIntentDigest(witnessedIntent) !== anchor.intentDigest) return false;
  const wholeGroup = db.all<{ sequence: number; entityType: string }>(sql`SELECT rowid AS sequence, entity_type AS entityType
    FROM audit_log WHERE group_id=${anchor.groupId} ORDER BY rowid LIMIT ${MAX_AUDIT + 1}`);
  // A nested caller or a reused group cannot turn a pre-commit intermediate amount into proof.
  return wholeGroup.length <= MAX_AUDIT && wholeGroup.some((entry) => entry.sequence === witness.sequence) &&
    !wholeGroup.some((entry) => entry.sequence > anchor.auditWatermark && isTable(entry.entityType));
}

/** Internal evidence stays in the repository. Public callers receive lifecycle results only. */
export function readGoalLifecycles(db: Executor, goals: readonly GoalLifecycleSource[], asOf: string): Map<string, GoalLifecycle> {
  const result = new Map<string, GoalLifecycle>();
  const legacy = goals.filter((goal) => goal.lifecycleAnchorJson === null);
  for (const [id, value] of replayLifecycles(db, legacy, asOf)) result.set(id, value);
  for (const goal of goals.filter((item) => item.lifecycleAnchorJson !== null)) {
    const anchor = parseAnchor(goal.lifecycleAnchorJson!);
    const fallback = goalLifecycle({ ...goal, asOf, points: [], complete: false });
    if (!anchor || goals.length > 32) { result.set(goal.id, fallback); continue; }
    result.set(goal.id, replayLifecycles(db, [goal], asOf, anchor).get(goal.id) ?? fallback);
  }
  return result;
}
