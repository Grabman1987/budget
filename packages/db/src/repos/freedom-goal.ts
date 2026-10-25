import { and, desc, eq, sql } from 'drizzle-orm';
import {
  ageOn,
  freedomGoalAge,
  freedomGoalDocument,
  freedomGoalMonths,
  freedomGoalYearFromAge,
  isFreedomGoalYear,
  MAX_FREEDOM_MONTHS,
  type FreedomGoalChange,
  type FreedomGoalDocument,
  type FreedomGoalState,
  type FreedomGoalWrite,
} from '@budget/domain';
import { appSetting, auditLog } from '../schema';
import { withGroup, type AuditContext } from './audit';
import { createEntity, getEntity, updateEntity } from './entities';
import { ConflictError } from './errors';
import { getProfile } from './profile';
import { runInTransaction, type Executor } from './types';

export const FREEDOM_GOAL_SETTING = 'wealth.freedom.goal';
const BIRTH_SETTING = 'profile.birth_date';

/** Audit insertion order advances for actual undo/redo and deletion/recreation, including ABA. */
function revision(db: Executor, key: string): string {
  return (
    db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.entityType, 'app_setting'), eq(auditLog.entityId, key)))
      .orderBy(desc(sql`rowid`))
      .limit(1)
      .get()?.id ?? 'none'
  );
}

function document(db: Executor): FreedomGoalDocument | null {
  const stored = getEntity(db, appSetting, FREEDOM_GOAL_SETTING);
  if (!stored) return { schemaVersion: 1, goalYear: null };
  try {
    return freedomGoalDocument(JSON.parse(stored.value));
  } catch {
    return null;
  }
}

/** The response intentionally contains neither the full birth date nor its birth year. */
export function freedomGoal(db: Executor, today: string): FreedomGoalState {
  const doc = document(db);
  const birthDate = getProfile(db).birthDate;
  const goalYear = doc?.goalYear ?? null;
  return {
    schemaVersion: 1,
    revision: revision(db, FREEDOM_GOAL_SETTING),
    ageRevision: revision(db, BIRTH_SETTING),
    ageAvailable: ageOn(birthDate, today) !== null,
    goalAge: freedomGoalAge(birthDate, goalYear, today),
    goalYear,
    unavailable: doc === null,
    asOf: today,
  };
}

export function changeFreedomGoal(
  db: Executor,
  expectedRevision: string,
  change: FreedomGoalChange,
  ctx: AuditContext,
  today: string,
): FreedomGoalWrite {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const before = freedomGoal(tx, today);
    if (before.unavailable) throw new ConflictError('Das gespeicherte Ziel ist nicht verfügbar.');
    // Even a seemingly equal value may be a stale request after undo/recreate.
    if (before.revision !== expectedRevision)
      throw new ConflictError('Das Ziel wurde inzwischen geändert. Bitte neu laden.');
    let year: number | null = null;
    if (change.kind === 'year') year = change.year;
    else if (change.kind === 'age') {
      if (change.ageRevision !== before.ageRevision)
        throw new ConflictError('Das Profil wurde inzwischen geändert. Bitte neu laden.');
      year = freedomGoalYearFromAge(getProfile(tx).birthDate, change.age, today);
      if (year === null)
        throw new RangeError('Für die Alterseingabe fehlt ein gültiges Geburtsdatum.');
    }
    if (
      year !== null &&
      (!isFreedomGoalYear(year) || freedomGoalMonths(year, today) > MAX_FREEDOM_MONTHS)
    )
      throw new RangeError('Bitte ein Zieljahr innerhalb des 60-jährigen Rechenzeitraums wählen.');
    if (before.goalYear === year) return { ...before, groupId: grouped.groupId, changed: false };
    const value = JSON.stringify({ schemaVersion: 1, goalYear: year });
    if (getEntity(tx, appSetting, FREEDOM_GOAL_SETTING))
      updateEntity(tx, appSetting, FREEDOM_GOAL_SETTING, { value }, grouped);
    else createEntity(tx, appSetting, { id: FREEDOM_GOAL_SETTING, value }, grouped);
    return { ...freedomGoal(tx, today), groupId: grouped.groupId, changed: true };
  });
}
