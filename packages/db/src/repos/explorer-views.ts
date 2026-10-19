import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  explorerViewInput,
  explorerViewsDocument,
  MAX_EXPLORER_VIEWS,
  type ExplorerViewsChange,
  type ExplorerViewsDocument,
  type ExplorerViewsState,
  type ExplorerViewsWrite,
} from '@budget/domain';
import { appSetting, auditLog } from '../schema';
import { createEntity, getEntity, updateEntity } from './entities';
import { history, withGroup, type AuditContext } from './audit';
import { ConflictError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';

export const EXPLORER_SETTING = 'reports.explorer.views';
const empty = (): ExplorerViewsDocument => ({ schemaVersion: 1, views: [], imports: [] });

function document(db: Executor): ExplorerViewsDocument | null {
  const stored = getEntity(db, appSetting, EXPLORER_SETTING);
  if (!stored) return empty();
  try {
    return explorerViewsDocument(JSON.parse(stored.value));
  } catch {
    return null;
  }
}

/** Audit insertion order includes undo/redo and does not rewind when row snapshots do. */
export function explorerViews(db: Executor): ExplorerViewsState {
  const revision =
    db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'app_setting'), eq(auditLog.entityId, EXPLORER_SETTING)))
      .orderBy(desc(sql`rowid`))
      .limit(1)
      .get()?.id ?? 'none';
  const doc = document(db);
  return { schemaVersion: 1, revision, views: doc?.views ?? [], unavailable: doc === null };
}

function acknowledged(db: Executor, doc: ExplorerViewsDocument, digest: string): boolean {
  if (doc.imports.includes(digest)) return true;
  // Import acknowledgment survives deletion and undo of the imported views. A lost response
  // must not cause a later retry to resurrect a view that the owner deliberately removed.
  return history(db, 'app_setting', EXPLORER_SETTING).some((entry) => {
    const value = entry.after?.['value'];
    try {
      return (
        typeof value === 'string' &&
        explorerViewsDocument(JSON.parse(value))?.imports.includes(digest)
      );
    } catch {
      return false;
    }
  });
}

export function changeExplorerViews(
  db: Executor,
  revision: string,
  change: ExplorerViewsChange,
  ctx: AuditContext,
): ExplorerViewsWrite {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const before = explorerViews(tx);
    const doc = document(tx);
    if (!doc) throw new ConflictError('Gespeicherte Ansichten sind nicht verfügbar.');
    let digest: string | undefined;
    if (change.kind === 'import') {
      if (!change.views.length || change.views.length > MAX_EXPLORER_VIEWS)
        throw new RangeError('Invalid view batch');
      const normalized = change.views.map(explorerViewInput);
      if (normalized.some((view) => !view)) throw new RangeError('Invalid saved query');
      change = { ...change, views: normalized.filter((view) => view !== null) };
      digest = createHash('sha256').update(JSON.stringify(change.views)).digest('hex');
      if (acknowledged(tx, doc, digest))
        return { ...before, groupId: grouped.groupId, changed: false };
    }
    if (before.revision !== revision)
      throw new ConflictError('Die Ansichten wurden inzwischen geändert. Bitte neu laden.');
    const next: ExplorerViewsDocument = {
      ...doc,
      views: [...doc.views],
      imports: [...doc.imports],
    };
    if (change.kind === 'save') {
      const view = explorerViewInput(change.view);
      if (!view) throw new RangeError('Invalid saved query');
      const id = change.id;
      const index = id === undefined ? -1 : next.views.findIndex((v) => v.id === id);
      if (change.id !== undefined && index < 0)
        throw new EntityNotFoundError('explorer_view', change.id);
      if (
        next.views.some((v, i) => i !== index && v.name.toLowerCase() === view.name.toLowerCase())
      )
        throw new ConflictError('Eine Ansicht mit diesem Namen ist bereits vorhanden.');
      if (index < 0) next.views.push({ id: randomUUID(), ...view });
      else next.views[index] = { id: change.id!, ...view };
    } else if (change.kind === 'delete') {
      const id = change.id;
      if (!next.views.some((view) => view.id === id))
        throw new EntityNotFoundError('explorer_view', change.id);
      next.views = next.views.filter((view) => view.id !== id);
    } else {
      for (const view of change.views) {
        if (
          next.views.some(
            (v) =>
              v.name.toLowerCase() === view.name.toLowerCase() &&
              JSON.stringify(v.query) === JSON.stringify(view.query),
          )
        )
          continue;
        let name = view.name;
        for (
          let suffix = 1;
          next.views.some((v) => v.name.toLowerCase() === name.toLowerCase());
          suffix++
        ) {
          const ending = ` (lokal ${suffix})`;
          name = view.name.slice(0, 40 - ending.length) + ending;
        }
        next.views.push({ id: randomUUID(), name, query: view.query });
      }
      next.imports = [...next.imports, digest!].slice(-MAX_EXPLORER_VIEWS);
    }
    if (next.views.length > MAX_EXPLORER_VIEWS)
      throw new ConflictError(
        'Höchstens 20 Ansichten. Lokale Ansichten bleiben für später erhalten.',
      );
    if (JSON.stringify(next) === JSON.stringify(doc))
      return { ...before, groupId: grouped.groupId, changed: false };
    const value = JSON.stringify(next);
    if (getEntity(tx, appSetting, EXPLORER_SETTING))
      updateEntity(tx, appSetting, EXPLORER_SETTING, { value }, grouped);
    else createEntity(tx, appSetting, { id: EXPLORER_SETTING, value }, grouped);
    return { ...explorerViews(tx), groupId: grouped.groupId, changed: true };
  });
}
