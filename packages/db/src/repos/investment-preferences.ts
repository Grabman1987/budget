import type { CostMethod } from '@budget/domain';
import { investmentPreference } from '../schema';
import { createEntity, getEntity, updateEntity } from './entities';
import { runInTransaction, type Executor } from './types';
import type { AuditContext } from './audit';

const ID = 'portfolio';

/** One persisted method for all depot/crypto positions; an unset preference uses average cost. */
export function investmentPreferences(db: Executor): { costMethod: CostMethod } {
  return { costMethod: getEntity(db, investmentPreference, ID)?.costMethod ?? 'average' };
}

export function setInvestmentCostMethod(db: Executor, costMethod: CostMethod, ctx: AuditContext) {
  return runInTransaction(db, (tx) => {
    if (getEntity(tx, investmentPreference, ID))
      updateEntity(tx, investmentPreference, ID, { costMethod }, ctx);
    else createEntity(tx, investmentPreference, { id: ID, costMethod }, ctx);
    return investmentPreferences(tx);
  });
}
