import {
  inflationBasketChanges,
  inflationBasketSetting,
  type InflationBasketSetting,
} from '@budget/domain';
import { appSetting, category, payee } from '../schema';
import { withGroup, type AuditContext } from './audit';
import { createEntity, getEntity, updateEntity } from './entities';
import { updateCategory } from './categories';
import { CategoryRuleError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';

const KEY = 'inflation.basket';

export function inflationBasketSettings(db: Executor): Map<string, InflationBasketSetting> {
  const stored = getEntity(db, appSetting, KEY);
  const values: Record<string, unknown> = stored ? JSON.parse(stored.value) : {};
  return new Map(
    Object.entries(values).map(([id, value]) => [id, inflationBasketSetting.parse(value)]),
  );
}

/** One audited, atomic action for category selection, method and payee exclusions. */
export function saveInflationBasket(db: Executor, input: unknown, ctx: AuditContext) {
  const { changes } = inflationBasketChanges.parse(input);
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    const settings = inflationBasketSettings(tx);
    let changed = false;
    for (const change of changes) {
      const c = getEntity(tx, category, change.categoryId);
      if (!c) throw new EntityNotFoundError('category', change.categoryId);
      if (!c.class) throw new CategoryRuleError('Bitte eine Ausgabenkategorie wählen.');
      for (const id of change.excludedPayeeIds ?? [])
        if (id !== null && !getEntity(tx, payee, id)) throw new EntityNotFoundError('payee', id);
      const before = settings.get(c.id) ?? inflationBasketSetting.parse({});
      const next = inflationBasketSetting.parse({
        ...before,
        inclusion: change.inclusion === undefined ? before.inclusion : change.inclusion,
        excludedPayeeIds: [...new Set(change.excludedPayeeIds ?? before.excludedPayeeIds)],
        method: change.method === undefined ? before.method : change.method,
        coicop: change.coicop ?? before.coicop,
      });
      if (next.method === 'cpi' && !next.coicop.length)
        throw new CategoryRuleError(
          'Für VPI-Teilindex bitte mindestens eine COICOP-Klasse wählen.',
        );
      if (
        change.inclusion !== undefined ||
        change.excludedPayeeIds !== undefined ||
        change.method !== undefined ||
        change.coicop !== undefined
      ) {
        settings.set(c.id, next);
        changed = true;
      }
      if (change.trailingMean !== undefined && c.inflationTrailingMean !== change.trailingMean)
        updateCategory(tx, c.id, { inflationTrailingMean: change.trailingMean }, grouped);
    }
    if (changed) {
      const current = getEntity(tx, appSetting, KEY);
      const value = JSON.stringify(Object.fromEntries(settings));
      if (!current) createEntity(tx, appSetting, { id: KEY, value }, grouped);
      else if (current.value !== value) updateEntity(tx, appSetting, KEY, { value }, grouped);
    }
  });
  return { groupId: grouped.groupId };
}
