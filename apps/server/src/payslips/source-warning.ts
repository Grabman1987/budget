import { randomUUID } from 'node:crypto';
import { inboxItem, insertTracked, type Db } from '@budget/db';
import { and, eq, isNull } from 'drizzle-orm';

/** One open, generic source warning at a time; never carries provider text or document content. */
export function payslipSourceWarning(db: Db, detail: string) {
  if (
    db
      .select()
      .from(inboxItem)
      .where(and(eq(inboxItem.refType, 'payslip-source'), isNull(inboxItem.resolvedAt)))
      .get()
  )
    return;
  insertTracked(
    db,
    inboxItem,
    {
      id: randomUUID(),
      kind: 'revision',
      title: 'Gehaltszettel-Datenquelle prüfen',
      detail,
      refType: 'payslip-source',
      urgent: true,
    },
    { actor: 'system' },
  );
}
