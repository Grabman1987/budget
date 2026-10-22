import type { CostMethod } from '@budget/domain';
import { isNull } from 'drizzle-orm';
import { investmentPreference, securityTransferPair } from '../schema';
import { createEntity, getEntity, updateEntity } from './entities';
import { runInTransaction, type Executor } from './types';
import type { AuditContext } from './audit';
import { assertPairedScopes, pairedScopesFor } from './security-transfer-invariants';
import { ConflictError } from './errors';

const ID = 'portfolio';

/** One persisted method for all depot/crypto positions; an unset preference uses average cost. */
export function investmentPreferences(db: Executor): { costMethod: CostMethod } {
  return { costMethod: getEntity(db, investmentPreference, ID)?.costMethod ?? 'average' };
}

export function setInvestmentCostMethod(db: Executor, costMethod: CostMethod, ctx: AuditContext) {
  return runInTransaction(db, (tx) => {
    const pairSecurities = tx.select({ securityId: securityTransferPair.securityId })
      .from(securityTransferPair).where(isNull(securityTransferPair.deletedAt)).limit(1001).all();
    if (pairSecurities.length > 1000)
      throw new ConflictError('Die belegte Übertragshistorie überschreitet die Änderungsgrenze.');
    const scopes = pairedScopesFor(tx, [...new Set(pairSecurities.map((row) => row.securityId))]
      .map((securityId) => ({ securityId })));
    if (getEntity(tx, investmentPreference, ID))
      updateEntity(tx, investmentPreference, ID, { costMethod }, ctx);
    else createEntity(tx, investmentPreference, { id: ID, costMethod }, ctx);
    assertPairedScopes(tx, scopes);
    return investmentPreferences(tx);
  });
}
