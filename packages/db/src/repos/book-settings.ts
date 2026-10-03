import { isPlausibleBirthDate } from '@budget/domain';
import { isNull } from 'drizzle-orm';
import { appSetting, employerPension } from '../schema';
import { createEntity, getEntity, restoreEntity, updateEntity } from './entities';
import { withGroup, type AuditContext } from './audit';
import { getProfile } from './profile';
import { runInTransaction, type Executor } from './types';

export function getBookSettings(db: Executor) {
  return {
    birthMonth:
      getEntity(db, appSetting, 'profile.birth_month')?.value ??
      getProfile(db).birthDate.slice(0, 7),
    pension: db
      .select()
      .from(employerPension)
      .where(isNull(employerPension.deletedAt))
      .all()
      .map((r) => ({ month: r.month, amountCents: r.amountCents }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}

/** Private month/year and explicit monthly contributions, one atomic audit group with undo/redo. */
export function saveBookSettings(
  db: Executor,
  patch: { birthMonth?: string; pension?: { month: string; amountCents: number }[] },
  ctx: AuditContext,
  today: string,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    if (patch.birthMonth !== undefined) {
      const value = patch.birthMonth;
      if (value !== '' && !isPlausibleBirthDate(`${value}-01`, today))
        throw new RangeError('Invalid birth month');
      const current = getEntity(tx, appSetting, 'profile.birth_month');
      if (!current) createEntity(tx, appSetting, { id: 'profile.birth_month', value }, grouped);
      else if (current.value !== value)
        updateEntity(tx, appSetting, current.id, { value }, grouped);
    }
    for (const row of patch.pension ?? []) {
      if (
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) ||
        !Number.isSafeInteger(row.amountCents) ||
        row.amountCents < 0
      )
        throw new RangeError('Invalid employer contribution');
      const id = `pension-${row.month}`;
      const current = getEntity(tx, employerPension, id, { includeDeleted: true });
      if (!current) createEntity(tx, employerPension, { id, ...row }, grouped);
      else {
        if (current.deletedAt !== null) restoreEntity(tx, employerPension, id, grouped);
        if (current.amountCents !== row.amountCents)
          updateEntity(tx, employerPension, id, row, grouped);
      }
    }
    return getBookSettings(tx);
  });
}
