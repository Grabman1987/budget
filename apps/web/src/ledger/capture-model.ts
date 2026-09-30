import type { BudgetMonthView } from '../budget/budget-api';
import { STAGES } from '../budget/labels';
import type { BookingKind } from './booking-model';
import type { AccountRow, Lookups } from './types';

/** Pure parts of the capture panel: what can be picked, in which order, and what is remembered. */

export interface PickCategory {
  id: string;
  name: string;
  /** Heading in the list: the waterfall stage, or "Einnahmen" / "Ohne Stufe". */
  group: string;
  cls: 'need' | 'want' | 'future' | null;
  kind: string;
  /** Available of the booking month (cents); `null` while the budget is not loaded. */
  availableCents: number | null;
  hidden: boolean;
}

const stageTitle = (stage: number | null, kind: string): string => {
  if (stage !== null) return `${stage} ${STAGES.find((s) => s.n === stage)?.name ?? ''}`.trim();
  return kind === 'income' ? 'Einnahmen' : 'Ohne Stufe';
};

/**
 * Categories a booking can go to, ordered by waterfall stage (then group and sort order) with the
 * Available of the month. Card payments are transfers and Auslagen belong to contact shares, so
 * neither is offered here. Falls back to the plain pick list while the budget loads.
 */
export function pickableCategories(
  budget: BudgetMonthView | undefined,
  lookups: Lookups | undefined,
): PickCategory[] {
  if (budget) {
    const available = new Map(
      budget.summary.envelopes.map((e) => [e.categoryId, e.availableCents] as const),
    );
    const groupOrder = new Map(budget.groups.map((g, i) => [g.id, i] as const));
    const ranked = budget.categories
      .filter((c) => c.kind !== 'card_payment' && c.kind !== 'advance')
      .map((c) => ({
        order: [c.stage ?? 99, groupOrder.get(c.groupId) ?? 0, c.sortOrder] as const,
        item: {
          id: c.id,
          name: c.name,
          group: stageTitle(c.stage, c.kind),
          cls: c.class,
          kind: c.kind,
          availableCents: available.get(c.id) ?? null,
          hidden: c.hiddenAt !== null,
        } satisfies PickCategory,
      }));
    ranked.sort(
      (a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2],
    );
    return ranked.map((r) => r.item);
  }
  return (lookups?.categories ?? [])
    .filter((c) => c.kind !== 'card_payment' && c.kind !== 'advance')
    .map((c) => ({
      id: c.id,
      name: c.name,
      group: c.kind === 'income' ? 'Einnahmen' : 'Kategorien',
      cls: c.class === 'need' || c.class === 'want' || c.class === 'future' ? c.class : null,
      kind: c.kind,
      availableCents: null,
      hidden: false,
    }));
}

/**
 * What the category field offers for a kind: spending never goes to an income category, hidden
 * categories only while they are the selected one.
 */
export function categoriesFor(
  all: ReadonlyArray<PickCategory>,
  kind: BookingKind,
  selectedId: string,
): PickCategory[] {
  return all.filter(
    (c) => (!c.hidden || c.id === selectedId) && (kind !== 'expense' || c.kind !== 'income'),
  );
}

/** Most recent first, no duplicates, at most `max` entries. */
export function pushRecent(list: ReadonlyArray<string>, id: string, max = 6): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

/** Accounts for a pick list: the ones used last first, closed accounts left out. */
export function orderAccounts(
  accounts: ReadonlyArray<AccountRow>,
  recent: ReadonlyArray<string>,
): AccountRow[] {
  const open = accounts.filter((a) => !a.closedAt);
  const rank = (a: AccountRow) => {
    const i = recent.indexOf(a.id);
    return i === -1 ? recent.length : i;
  };
  return [...open].sort((a, b) => rank(a) - rank(b));
}

/** The account a new booking starts on: the one being looked at, else the last used budget account. */
export function defaultAccountId(
  accounts: ReadonlyArray<AccountRow>,
  recent: ReadonlyArray<string>,
  preferred?: string,
): string {
  const ordered = orderAccounts(accounts, recent);
  if (preferred && ordered.some((a) => a.id === preferred)) return preferred;
  return (ordered.find((a) => a.onBudget) ?? ordered[0])?.id ?? '';
}

export interface CaptureMemory {
  accounts: string[];
  categories: string[];
}

const MEMORY_KEY = 'budget-capture-memory';

/** What the panel remembers between visits (per browser, not data). */
export function readMemory(): CaptureMemory {
  try {
    const raw = JSON.parse(localStorage.getItem(MEMORY_KEY) ?? '{}') as Partial<CaptureMemory>;
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
    return { accounts: list(raw.accounts), categories: list(raw.categories) };
  } catch {
    return { accounts: [], categories: [] };
  }
}

export function remember(accountId: string, categoryId: string | null): void {
  try {
    const memory = readMemory();
    localStorage.setItem(
      MEMORY_KEY,
      JSON.stringify({
        accounts: pushRecent(memory.accounts, accountId),
        categories: categoryId ? pushRecent(memory.categories, categoryId) : memory.categories,
      }),
    );
  } catch {
    // Private mode or blocked storage: the panel still works, it just forgets.
  }
}

/** Quick date picks relative to today: `[label, day]`. */
export function quickDays(today: string, shift: (day: string, n: number) => string) {
  return [
    ['Heute', today],
    ['Gestern', shift(today, -1)],
    ['Vorgestern', shift(today, -2)],
  ] as const;
}

/**
 * The category a chosen payee's default fills in, or `undefined` to leave the field alone. It only
 * replaces an empty category or the one the previous payee's default set: a category the user
 * picked stays.
 */
export function categoryFromPayee(
  current: string,
  appliedByPayee: string | null,
  payeeDefault: string | null | undefined,
): string | undefined {
  if (!payeeDefault) return undefined;
  return current === '' || current === appliedByPayee ? payeeDefault : undefined;
}

/**
 * Has the new booking got input that closing would lose? `keptPayee` is the payee that "Speichern
 * und neu" carried over: it is context, not input.
 */
export function captureDirty(
  draft: { amount: string; payee: string; memo: string; splitOn: boolean },
  keptPayee: string,
): boolean {
  return Boolean(
    draft.amount.trim() ||
    draft.payee.trim() !== keptPayee.trim() ||
    draft.memo.trim() ||
    draft.splitOn,
  );
}
