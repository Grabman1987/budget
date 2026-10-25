import { and, desc, eq, sql } from 'drizzle-orm';
import {
  calculateFunding,
  fundingPlanSchema,
  type FundingPlan,
  type FundingPlanState,
} from '@budget/domain';
import { appSetting, auditLog } from '../schema';
import { createEntity, getEntity, updateEntity } from './entities';
import { withGroup, type AuditContext } from './audit';
import { ConflictError } from './errors';
import { runInTransaction, type Executor } from './types';

export const FUNDING_SETTING = 'portfolio.funding-plan';
export function fundingPlan(db: Executor): FundingPlanState {
  const revision =
    db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'app_setting'), eq(auditLog.entityId, FUNDING_SETTING)))
      .orderBy(desc(sql`rowid`))
      .limit(1)
      .get()?.id ?? 'none';
  const stored = getEntity(db, appSetting, FUNDING_SETTING);
  if (!stored) return { plan: null, revision, unavailable: false };
  try {
    const plan = fundingPlanSchema.parse(JSON.parse(stored.value));
    calculateFunding(plan);
    return { plan, revision, unavailable: false };
  } catch {
    return { plan: null, revision, unavailable: true };
  }
}
export function saveFundingPlan(
  db: Executor,
  revision: string,
  input: FundingPlan,
  ctx: AuditContext,
) {
  const plan = fundingPlanSchema.parse(input);
  calculateFunding(plan);
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const before = fundingPlan(tx);
    if (before.unavailable || before.revision !== revision)
      throw new ConflictError(
        'Der Anlageplan wurde inzwischen geändert oder ist nicht lesbar. Bitte neu laden.',
      );
    if (JSON.stringify(before.plan) === JSON.stringify(plan))
      return { ...before, groupId: grouped.groupId, changedCount: 0 };
    const value = JSON.stringify(plan);
    if (getEntity(tx, appSetting, FUNDING_SETTING))
      updateEntity(tx, appSetting, FUNDING_SETTING, { value }, grouped);
    else createEntity(tx, appSetting, { id: FUNDING_SETTING, value }, grouped);
    return { ...fundingPlan(tx), groupId: grouped.groupId, changedCount: 1 };
  });
}
