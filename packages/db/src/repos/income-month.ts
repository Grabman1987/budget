import { incomeMonthDefault, type IncomeMonthRule } from '@budget/domain';
import { appSetting, category, incomeType, payee } from '../schema';
import { createEntity, getEntity, updateEntity } from './entities';
import { withGroup, type AuditContext } from './audit';
import { BookingInvariantError } from './errors';
import { runInTransaction, type Executor } from './types';

const KEY = 'income.month_rules';
export function incomeMonthRules(db: Executor): IncomeMonthRule[] {
  return JSON.parse(getEntity(db, appSetting, KEY)?.value ?? '[]') as IncomeMonthRule[];
}

export function saveIncomeMonthRules(db: Executor, rules: IncomeMonthRule[], ctx: AuditContext) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const seen = new Set<string>();
    for (const r of rules) {
      const key = `${r.scope}:${r.targetId}`;
      const table = r.scope === 'payee' ? payee : r.scope === 'category' ? category : incomeType;
      const target = getEntity(tx, table, r.targetId);
      if (!target || (r.scope === 'category' && !('kind' in target && target.kind === 'income')))
        throw new BookingInvariantError(
          'Bitte einen vorhandenen Zahler oder eine Einnahmenkategorie wählen.',
        );
      if (seen.has(key))
        throw new BookingInvariantError('Für diese Quelle besteht bereits eine Regel.');
      seen.add(key);
    }
    const value = JSON.stringify(rules);
    const current = getEntity(tx, appSetting, KEY);
    if (current) {
      if (current.value !== value) updateEntity(tx, appSetting, KEY, { value }, grouped);
    } else createEntity(tx, appSetting, { id: KEY, value }, grouped);
    return { rules: incomeMonthRules(tx), groupId: grouped.groupId };
  });
}

/** Defaults apply only when an owner creates income, never during an automatic bank fetch. */
export function bookingIncomeDefault(
  db: Executor,
  input: {
    amountCents: number;
    payeeId?: string | null | undefined;
    splits: readonly {
      categoryId?: string | null;
      incomeTypeId?: string | null;
      contactId?: string | null;
      transferAccountId?: string | null;
      amountCents: number;
    }[];
  },
): boolean {
  if (input.amountCents <= 0 || input.splits.length !== 1) return false;
  const s = input.splits[0]!;
  if (s.contactId || s.transferAccountId || s.amountCents <= 0) return false;
  if (s.categoryId && getEntity(db, category, s.categoryId)?.kind !== 'income') return false;
  return incomeMonthDefault(incomeMonthRules(db), input.payeeId, s.categoryId, s.incomeTypeId);
}
