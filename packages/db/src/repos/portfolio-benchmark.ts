import { appSetting, security } from '../schema';
import { createEntity, getEntity, updateEntity } from './entities';
import { withGroup, type AuditContext } from './audit';
import { runInTransaction, type Executor } from './types';

const KEY = 'portfolio.benchmark_security_id';

export function portfolioBenchmark(db: Executor) {
  const securityId = getEntity(db, appSetting, KEY)?.value || null;
  const selected = securityId ? getEntity(db, security, securityId) : null;
  return { securityId, name: selected?.name ?? null, available: Boolean(selected) };
}

/** Explicit owner selection, never an implicit largest-position benchmark. */
export function setPortfolioBenchmark(db: Executor, securityId: string | null, ctx: AuditContext) {
  return runInTransaction(db, (tx) => {
    if (securityId !== null && !getEntity(tx, security, securityId))
      throw new RangeError('Benchmark security must be live');
    const value = securityId ?? '';
    const current = getEntity(tx, appSetting, KEY);
    const grouped = withGroup(ctx);
    if (!current) createEntity(tx, appSetting, { id: KEY, value }, grouped);
    else {
      if (current.value !== value) updateEntity(tx, appSetting, KEY, { value }, grouped);
    }
    return portfolioBenchmark(tx);
  });
}
