import {
  activeGoalAuditEntries,
  goalLifecycle,
  todayInVienna,
  type GoalLifecycle,
  type GoalLifecyclePoint,
} from '@budget/domain';
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
export interface GoalLifecycleSource {
  id: string;
  categoryId: string | null;
  startMonth: string;
  targetCents: number;
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
  return JSON.stringify(tables.map((t) => [...state.get(t)!].sort(([a], [b]) => a.localeCompare(b))));
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
  const assigned: BudgetLedgerRows['assigned'] = {};
  for (const r of values('envelope_month'))
    (assigned[text(r, 'month')] ??= {})[text(r, 'category_id')] = cents(r, 'assigned_cents');
  const held = Object.fromEntries(values('budget_month').map((r) => [text(r, 'month'), cents(r, 'held_cents')]));
  return budgetInputFromRows({ accounts, categories, rows, assigned, held });
}
function load(db: Executor): { state: State; entries: Entry[] } {
  const state: State = new Map();
  for (const table of tables) {
    const rows = db.all<Row>(sql.raw(`SELECT ${fields[table].join(', ')} FROM ${table} LIMIT ${MAX_ROWS + 1}`));
    if (rows.length > MAX_ROWS) throw new Error('Goal evidence bound exceeded');
    state.set(table, new Map(rows.flatMap((r) => {
      const projected = project(table, r);
      return projected ? [[keyOf(table, projected), projected] as const] : [];
    })));
  }
  const raw = db.all<Row>(sql`SELECT rowid AS sequence, id, ts, entity_type, entity_id,
    before_json, after_json, group_id, undo_of_id FROM audit_log ORDER BY rowid LIMIT ${MAX_AUDIT + 1}`);
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
  return { state, entries };
}

/** No GET writes, no guessed history, and no independently implemented balance arithmetic. */
export function readGoalLifecycles(db: Executor, goals: readonly GoalLifecycleSource[], asOf: string): Map<string, GoalLifecycle> {
  const fallback = () => new Map(goals.map((goal) => [goal.id, goalLifecycle({
    ...goal, asOf, manualCompletedAt: goal.manualCompletedOn, points: [], complete: false,
  })]));
  if (goals.every((goal) => goal.categoryId === null || goal.manualCompletedOn !== null)) return fallback();
  try {
    const { state, entries } = load(db);
    const active = activeGoalAuditEntries(entries);
    if (!active) return fallback();
    const current = fingerprint(state);
    const finalLedger = ledger(state);
    // Final surviving signatures prevent an edited/deleted historical expense from completing a goal.
    const surviving = new Map(finalLedger.splits.map((split) => [split.splitId, JSON.stringify(split)]));
    for (const entry of [...entries].reverse()) apply(state, entry, true);
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
    const points = new Map(goals.map((goal) => [goal.id, [] as GoalLifecyclePoint[]]));
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
      if (day > asOf) continue;
      const month = day.slice(0, 7);
      const amounts = budgetOfLedger(source, [month], { asOf: day })[0]?.envelopes ?? {};
      const created = new Set(enabled.filter((entry) => entry.table === 'booking_split' && entry.before === null && entry.after !== null).map((entry) => entry.key));
      for (const goal of goals) {
        if (goal.categoryId === null || month < goal.startMonth) continue;
        const activity = budgetActivityOfLedger({ ...source, splits: source.splits.filter((split) => split.date <= day) }, month, goal.categoryId);
        const expense = activity.items.filter((item) => item.kind === 'booking' && item.cents < 0 && item.splitId && item.bookingId && item.date)
          .find((item) => {
            const split = source.splits.find((s) => s.splitId === item.splitId);
            return split && created.has(item.splitId!) && split.amountCents < 0 && split.transferAccountId === null
              && !excludedPayees.has(split.payeeId ?? '') && surviving.get(item.splitId!) === JSON.stringify(split);
          });
        points.get(goal.id)!.push({
          sequence: enabled.at(-1)!.sequence, day, availableCents: amounts[goal.categoryId]?.availableCents ?? 0,
          expense: expense ? { bookingId: expense.bookingId!, splitId: expense.splitId!, day: expense.date! } : null,
        });
      }
    }
    if (fingerprint(state) !== current) return fallback();
    return new Map(goals.map((goal) => [goal.id, goalLifecycle({
      ...goal, asOf, manualCompletedAt: goal.manualCompletedOn, points: points.get(goal.id)!,
      complete: goal.categoryId !== null,
    })]));
  } catch {
    // Corrupt/legacy/over-bound evidence is unavailable, not completion or an alternative balance.
    return fallback();
  }
}
