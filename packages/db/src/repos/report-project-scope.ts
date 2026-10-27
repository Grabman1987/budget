import { and, eq, isNull } from 'drizzle-orm';
import type { OverviewData } from '@budget/domain';
import { booking, project } from '../schema';
import { EntityNotFoundError } from './errors';
import { overviewData } from './report-ledger';
import { memoizedShared } from './request-memo';
import type { Executor } from './types';

export interface ReportProject {
  id: string;
  name: string;
  archived: boolean;
}

export interface ReportProjectScope {
  project: ReportProject;
  bookingIds: ReadonlySet<string>;
}

/** Attribution filters already-classified facts; it never removes a transfer's other leg first. */
export function reportProjectScope(
  db: Executor,
  projectId?: string,
): ReportProjectScope | undefined {
  if (projectId === undefined) return undefined;
  if (!projectId || projectId.length > 64) throw new EntityNotFoundError('project', projectId);
  return memoizedShared(db, `reportProjectScope:${projectId}`, () => {
    const row = db
      .select()
      .from(project)
      .where(and(eq(project.id, projectId), isNull(project.deletedAt)))
      .get();
    if (!row) throw new EntityNotFoundError('project', projectId);
    const ids = db
      .select({ id: booking.id })
      .from(booking)
      .where(and(eq(booking.projectId, projectId), isNull(booking.deletedAt)))
      .all();
    return {
      project: { id: row.id, name: row.name, archived: row.archivedAt !== null },
      bookingIds: new Set(ids.map(({ id }) => id)),
    };
  });
}

export function projectOverviewData(db: Executor, scope?: ReportProjectScope): OverviewData {
  const data = overviewData(db);
  return scope
    ? {
        ...data,
        splits: data.splits.filter(
          (s) => s.bookingId !== undefined && scope.bookingIds.has(s.bookingId),
        ),
      }
    : data;
}
