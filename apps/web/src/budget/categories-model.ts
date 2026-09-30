import type { CategoryTree } from './api';

/** The list order of Einstellungen › Kategorien: groups in order, each with its categories. */
export type Order = Array<{ id: string; categoryIds: string[] }>;

export function orderOf(tree: CategoryTree): Order {
  return tree.groups.map((g) => ({
    id: g.id,
    categoryIds: tree.categories.filter((c) => c.groupId === g.id).map((c) => c.id),
  }));
}

/** Move a category into `groupId`, before `beforeId` (or to the end of the group). */
export function moveCategory(
  order: Order,
  categoryId: string,
  groupId: string,
  beforeId: string | null,
): Order {
  const next = order.map((g) => ({
    id: g.id,
    categoryIds: g.categoryIds.filter((id) => id !== categoryId),
  }));
  const group = next.find((g) => g.id === groupId);
  if (!group) return order;
  const at = beforeId === null ? -1 : group.categoryIds.indexOf(beforeId);
  group.categoryIds.splice(at < 0 ? group.categoryIds.length : at, 0, categoryId);
  return next;
}

/**
 * One step up or down with the keyboard: within the group, and across the group border into the
 * neighbouring group (end of the previous one, start of the next one).
 */
export function stepCategory(order: Order, categoryId: string, delta: -1 | 1): Order {
  const gi = order.findIndex((g) => g.categoryIds.includes(categoryId));
  const group = order[gi];
  if (!group) return order;
  const i = group.categoryIds.indexOf(categoryId);
  const j = i + delta;
  if (j >= 0 && j < group.categoryIds.length) {
    const before = delta < 0 ? group.categoryIds[j]! : (group.categoryIds[j + 1] ?? null);
    return moveCategory(order, categoryId, group.id, before);
  }
  const neighbour = order[gi + delta];
  if (!neighbour) return order;
  return moveCategory(
    order,
    categoryId,
    neighbour.id,
    delta < 0 ? null : (neighbour.categoryIds[0] ?? null),
  );
}

/** Move a group one step up or down. */
export function stepGroup(order: Order, groupId: string, delta: -1 | 1): Order {
  const i = order.findIndex((g) => g.id === groupId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** Same order? (A drop on the own place writes nothing.) */
export const sameOrder = (a: Order, b: Order) => JSON.stringify(a) === JSON.stringify(b);
