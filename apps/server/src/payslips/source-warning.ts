import { randomUUID } from 'node:crypto';
import {
  inboxItem,
  insertTracked,
  updateTracked,
  runInTransaction,
  withGroup,
  type Db,
} from '@budget/db';
import { and, eq, isNull } from 'drizzle-orm';

/** One open, generic source warning at a time; never carries provider text or document content. */
export function payslipSourceWarning(db: Db, detail: string) {
  runInTransaction(db, (tx) => {
    const ctx = withGroup({ actor: 'system' });
    const existing = tx
      .select()
      .from(inboxItem)
      .where(and(eq(inboxItem.refType, 'payslip-source'), isNull(inboxItem.resolvedAt)))
      .get();
    if (existing) {
      if (existing.detail !== detail)
        updateTracked(tx, inboxItem, [existing.id], { detail, urgent: true }, ctx);
      return;
    }
    insertTracked(
      tx,
      inboxItem,
      {
        id: randomUUID(),
        kind: 'revision',
        title: 'Gehaltszettel-Datenquelle prüfen',
        detail,
        refType: 'payslip-source',
        urgent: true,
      },
      ctx,
    );
  });
}
