import { asc, isNull } from 'drizzle-orm';
import { account } from '../schema';
import { type AuditContext, updateTracked, withGroup } from './audit';
import { ConflictError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';

export interface OrderAccountsResult {
  /** All live accounts (open and closed) in their new order. */
  order: string[];
  /** How many accounts got a different `sortOrder` (only those are audited). */
  changed: number;
  groupId: string;
}

/**
 * Set the owner's account order. `ids` (unique, all live accounts) come first in the given order;
 * every account not listed follows in its current order, so the result is always one gapless
 * sequence 1..n (the sidebar, Konten › Übersicht and the selects show each group in this order).
 * One transaction and one audit group, so a single undo restores the old order. Rows whose
 * position does not change are not written. An unknown id throws `EntityNotFoundError` and
 * leaves the old order untouched.
 */
export function orderAccounts(
  db: Executor,
  ids: ReadonlyArray<string>,
  ctx: AuditContext,
): OrderAccountsResult {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const live = tx
      .select({ id: account.id, sortOrder: account.sortOrder })
      .from(account)
      .where(isNull(account.deletedAt))
      .orderBy(asc(account.sortOrder), asc(account.name), asc(account.id))
      .all();
    const known = new Set(live.map((a) => a.id));
    const seen = new Set<string>();
    for (const id of ids) {
      if (!known.has(id)) throw new EntityNotFoundError('account', id);
      if (seen.has(id)) throw new ConflictError(`Account ${id} is listed twice`);
      seen.add(id);
    }
    const order = [...ids, ...live.map((a) => a.id).filter((id) => !seen.has(id))];
    const before = new Map(live.map((a) => [a.id, a.sortOrder]));
    let changed = 0;
    order.forEach((id, index) => {
      if (before.get(id) === index + 1) return;
      updateTracked(tx, account, [id], { sortOrder: index + 1 }, grouped);
      changed += 1;
    });
    return { order, changed, groupId: grouped.groupId };
  });
}

export interface OrderByNamesResult extends OrderAccountsResult {
  /** Names without a live account: reported, never created. */
  unknown: string[];
  /** Names that match more than one account (all skipped). */
  ambiguous: string[];
}

const fold = (name: string) => name.trim().toLocaleLowerCase('de-AT');

/**
 * Operator variant of `orderAccounts`: accounts by exact name (trimmed, case-insensitive). Unknown
 * and ambiguous names are reported and skipped; repeated names count once.
 */
export function orderAccountsByNames(
  db: Executor,
  names: ReadonlyArray<string>,
  ctx: AuditContext,
  options: { dryRun?: boolean } = {},
): OrderByNamesResult {
  const live = db
    .select({ id: account.id, name: account.name })
    .from(account)
    .where(isNull(account.deletedAt))
    .all();
  const byName = new Map<string, string[]>();
  for (const a of live) byName.set(fold(a.name), [...(byName.get(fold(a.name)) ?? []), a.id]);
  const ids: string[] = [];
  const unknown: string[] = [];
  const ambiguous: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const found = byName.get(fold(name)) ?? [];
    if (found.length === 0) unknown.push(name);
    else if (found.length > 1) ambiguous.push(name);
    else if (!ids.includes(found[0]!)) ids.push(found[0]!);
  }
  if (options.dryRun) {
    const rest = live.map((a) => a.id).filter((id) => !ids.includes(id));
    return { order: [...ids, ...rest], changed: 0, groupId: '', unknown, ambiguous };
  }
  return { ...orderAccounts(db, ids, ctx), unknown, ambiguous };
}
