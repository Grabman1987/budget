import { asc, isNull } from 'drizzle-orm';
import { incomePause } from '../schema';
import { AuditError } from './errors';
import type { Executor } from './types';

/** Refuse undo/redo if replaying pause snapshots would leave inclusive intervals overlapping. */
export function assertIncomePauseInvariants(db: Executor): void {
  const rows = db
    .select()
    .from(incomePause)
    .where(isNull(incomePause.deletedAt))
    .orderBy(asc(incomePause.expectedPaymentId), asc(incomePause.startDate), asc(incomePause.id))
    .all();
  let sourceId: string | undefined;
  let previousEnd: string | undefined;
  for (const row of rows) {
    if (row.expectedPaymentId !== sourceId) {
      sourceId = row.expectedPaymentId;
      previousEnd = row.endDate;
      continue;
    }
    if (row.startDate <= previousEnd!)
      throw new AuditError('Income pause intervals for the same source may not overlap.');
    previousEnd = row.endDate;
  }
}
