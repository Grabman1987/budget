import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { bookingViewInput, bookingViewsDocument, BOOKING_VIEW_LIMIT, type BookingViewsChange, type BookingViewsDocument, type BookingViewsState, type BookingViewsWrite } from '@budget/domain';
import { appSetting, auditLog } from '../schema';
import { createEntity, getEntity, updateEntity } from './entities';
import { withGroup, type AuditContext } from './audit';
import { ConflictError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';

export const BOOKING_VIEWS_SETTING = 'ledger.bookings.views';
function document(db: Executor): BookingViewsDocument | null {
  const stored = getEntity(db, appSetting, BOOKING_VIEWS_SETTING);
  if (!stored) return { schemaVersion: 1, views: [] };
  try { return bookingViewsDocument(JSON.parse(stored.value)); } catch { return null; }
}
export function bookingViews(db: Executor): BookingViewsState {
  // Audit insertion order advances through Undo/redo, including deletion of the setting itself.
  const revision = db.select({ id: auditLog.id }).from(auditLog)
    .where(and(eq(auditLog.entityType, 'app_setting'), eq(auditLog.entityId, BOOKING_VIEWS_SETTING)))
    .orderBy(desc(sql`rowid`)).limit(1).get()?.id ?? 'none';
  const doc = document(db);
  return { schemaVersion: 1, revision, views: doc?.views ?? [], unavailable: doc === null };
}
export function changeBookingViews(db: Executor, revision: string, change: BookingViewsChange, ctx: AuditContext): BookingViewsWrite {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const before = bookingViews(tx);
    const doc = document(tx);
    if (!doc) throw new ConflictError('Gespeicherte Filteransichten sind nicht verfügbar.');
    if (before.revision !== revision) throw new ConflictError('Die Filteransichten wurden inzwischen geändert. Bitte neu laden.');
    const next: BookingViewsDocument = { schemaVersion: 1, views: [...doc.views] };
    const index = change.id === undefined ? -1 : next.views.findIndex((view) => view.id === change.id);
    if (change.id !== undefined && index < 0) throw new EntityNotFoundError('booking_view', change.id);
    if (change.kind === 'delete') next.views.splice(index, 1);
    else {
      const view = bookingViewInput(change.view);
      if (!view) throw new RangeError('Invalid saved booking filter');
      if (next.views.some((existing, i) => i !== index && existing.name.toLowerCase() === view.name.toLowerCase()))
        throw new ConflictError('Eine Filteransicht mit diesem Namen ist bereits vorhanden.');
      const saved = { id: change.id ?? randomUUID(), ...view };
      if (index < 0) next.views.push(saved); else next.views[index] = saved;
    }
    if (next.views.length > BOOKING_VIEW_LIMIT) throw new ConflictError('Höchstens 20 Filteransichten.');
    if (JSON.stringify(next) === JSON.stringify(doc)) return { ...before, groupId: grouped.groupId, changed: false };
    const value = JSON.stringify(next);
    if (getEntity(tx, appSetting, BOOKING_VIEWS_SETTING)) updateEntity(tx, appSetting, BOOKING_VIEWS_SETTING, { value }, grouped);
    else createEntity(tx, appSetting, { id: BOOKING_VIEWS_SETTING, value }, grouped);
    return { ...bookingViews(tx), groupId: grouped.groupId, changed: true };
  });
}
