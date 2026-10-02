import type { BudgetMonthView } from '../budget/budget-api';
import type { BookingKind } from './booking-model';
import type { AccountRow, Lookups } from './types';

/** Pure parts of the capture panel: what can be picked, in which order, and what is remembered. */

export interface PickCategory {
  id: string;
  name: string;
  /** Heading in the list: the name of the category group. */
  group: string;
  cls: 'need' | 'want' | 'future' | null;
  kind: string;
  /** Available of the booking month (cents); `null` while the budget is not loaded. */
  availableCents: number | null;
  hidden: boolean;
}

/**
 * Categories a booking can go to, in the order of the budget (category group, then sort order)
 * with the group's name as heading and the Available of the month. Card payments are transfers
 * and Auslagen belong to contact shares, so neither is offered here (`withAdvance` keeps the
 * Auslagen, for filtering). Falls back to the plain pick list while the budget loads.
 */
export function pickableCategories(
  budget: BudgetMonthView | undefined,
  lookups: Lookups | undefined,
  options: { withAdvance?: boolean } = {},
): PickCategory[] {
  const offered = (kind: string) =>
    kind !== 'card_payment' && (kind !== 'advance' || options.withAdvance === true);
  if (budget) {
    const available = new Map(
      budget.summary.envelopes.map((e) => [e.categoryId, e.availableCents] as const),
    );
    const groupOrder = new Map(budget.groups.map((g, i) => [g.id, i] as const));
    const groupName = new Map(budget.groups.map((g) => [g.id, g.name] as const));
    const ranked = budget.categories
      .filter((c) => offered(c.kind))
      .map((c) => ({
        order: [groupOrder.get(c.groupId) ?? 999, c.sortOrder] as const,
        item: {
          id: c.id,
          name: c.name,
          group: groupName.get(c.groupId) ?? 'Ohne Gruppe',
          cls: c.class,
          kind: c.kind,
          availableCents: available.get(c.id) ?? null,
          hidden: c.hiddenAt !== null,
        } satisfies PickCategory,
      }));
    ranked.sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1]);
    return ranked.map((r) => r.item);
  }
  const groupName = new Map((lookups?.groups ?? []).map((g) => [g.id, g.name] as const));
  const groupOrder = new Map((lookups?.groups ?? []).map((g) => [g.id, g.sortOrder] as const));
  return (lookups?.categories ?? [])
    .filter((c) => offered(c.kind))
    .sort(
      (a, b) =>
        (groupOrder.get(a.groupId ?? '') ?? 999) - (groupOrder.get(b.groupId ?? '') ?? 999) ||
        a.sortOrder - b.sortOrder,
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      group: groupName.get(c.groupId ?? '') ?? 'Ohne Gruppe',
      cls: c.class === 'need' || c.class === 'want' || c.class === 'future' ? c.class : null,
      kind: c.kind,
      availableCents: null,
      hidden: false,
    }));
}

/**
 * What a category field offers for a kind: spending never goes to an income category and hidden
 * (archived) categories are left out. `keep` names categories that stay listed although hidden
 * (a plain `<select>` must still show the one an existing booking line has).
 */
export function categoriesFor(
  all: ReadonlyArray<PickCategory>,
  kind: BookingKind,
  keep: string | ReadonlyArray<string> = '',
): PickCategory[] {
  const kept = typeof keep === 'string' ? [keep] : keep;
  return all.filter(
    (c) => (!c.hidden || kept.includes(c.id)) && (kind !== 'expense' || c.kind !== 'income'),
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
