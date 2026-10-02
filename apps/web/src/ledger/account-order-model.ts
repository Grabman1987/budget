import { bySortOrder, groupAccounts } from './account-groups';
import type { AccountGroupId } from './labels';
import type { AccountRow } from './types';

type Ordered = Pick<AccountRow, 'id' | 'type' | 'onBudget' | 'sortOrder' | 'name' | 'closedAt'>;

/** `ids` with `id` moved by one step (clamped to the ends); unchanged when `id` is not in `ids`. */
export function stepId(ids: ReadonlyArray<string>, id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  return moveTo(ids, from, to);
}

/** `ids` with the entry at `from` placed at index `to` (index in the resulting list). */
export function moveTo(ids: ReadonlyArray<string>, from: number, to: number): string[] {
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

/**
 * The whole order (what `PATCH /api/accounts/order` takes) after one group got a new order: open
 * accounts group by group in the shared group order, then the closed ones. A group order that
 * leaves out accounts of the group keeps them behind the listed ones.
 */
export function fullOrderWith<T extends Ordered>(
  accounts: ReadonlyArray<T>,
  groupId: AccountGroupId,
  groupIds: ReadonlyArray<string>,
): string[] {
  const open = accounts.filter((a) => !a.closedAt);
  const closed = accounts.filter((a) => a.closedAt).sort(bySortOrder);
  const ids = groupAccounts(open).flatMap(({ group, accounts: members }) => {
    if (group.id !== groupId) return members.map((a) => a.id);
    const own = new Set(members.map((a) => a.id));
    const listed = groupIds.filter((id) => own.has(id));
    const rest = members.map((a) => a.id).filter((id) => !listed.includes(id));
    return [...listed, ...rest];
  });
  return [...ids, ...closed.map((a) => a.id)];
}

/** The same accounts with `sortOrder` 1..n following `ids` (unlisted ones keep their place after). */
export function applyOrder<T extends Pick<AccountRow, 'id' | 'sortOrder' | 'name'>>(
  accounts: ReadonlyArray<T>,
  ids: ReadonlyArray<string>,
): T[] {
  const rank = new Map(ids.map((id, index) => [id, index + 1]));
  const rest = [...accounts]
    .filter((a) => !rank.has(a.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'de-AT'))
    .map((a, index) => [a.id, ids.length + index + 1] as const);
  const all = new Map([...rank, ...rest]);
  return accounts.map((a) => ({ ...a, sortOrder: all.get(a.id) ?? a.sortOrder }));
}

export interface RowBox {
  id: string;
  top: number;
  height: number;
}

/**
 * Where a dragged row would land: its index among the rows after it left its place, given the
 * row boxes as measured when the drag started and the pointer movement since (`dy`, clamped to
 * the list). The drop position is by the dragged row's centre against the other rows' centres.
 */
export function dragTarget(boxes: ReadonlyArray<RowBox>, id: string, dy: number): number {
  const mine = boxes.find((b) => b.id === id);
  if (!mine) return 0;
  const centre = mine.top + mine.height / 2 + dy;
  // A row below passes when the centres meet (the clamped end of the list must be reachable).
  return boxes.filter((b) => {
    if (b.id === id) return false;
    const mid = b.top + b.height / 2;
    return b.top > mine.top ? centre >= mid : centre > mid;
  }).length;
}

/** `dy` kept inside the list: the dragged row never leaves the first and last row's span. */
export function clampDrag(boxes: ReadonlyArray<RowBox>, id: string, dy: number): number {
  const mine = boxes.find((b) => b.id === id);
  const first = boxes[0];
  const last = boxes[boxes.length - 1];
  if (!mine || !first || !last) return 0;
  return Math.min(
    Math.max(dy, first.top - mine.top),
    last.top + last.height - (mine.top + mine.height),
  );
}

/**
 * Vertical shift (px) of a row that stays in the list while another one is dragged from `from`
 * to `target`: the rows between make room by the dragged row's height.
 */
export function shiftFor(index: number, from: number, target: number, height: number): number {
  if (from < target && index > from && index <= target) return -height;
  if (target < from && index >= target && index < from) return height;
  return 0;
}
