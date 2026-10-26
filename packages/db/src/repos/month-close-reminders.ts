import { addMonths, lastDayOfMonth, monthCloseStateSchema } from '@budget/domain';
import { like, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { appSetting } from '../schema';

export interface MonthCloseReminder {
  id: string;
  kind: 'close' | 'close-changed';
  month: string;
  target: string;
}

export interface MonthCloseTaskRead {
  tasks: MonthCloseReminder[];
  unavailable: { month: string | null; reason: 'legacy' | 'invalid_state' }[];
}

/** Booking-only notification scope. The close CAS also covers planning and next-month facts. */
export function readMonthCloseReminders(db: Db, today: string): MonthCloseTaskRead {
  const tasks: MonthCloseReminder[] = [];
  const unavailable: MonthCloseTaskRead['unavailable'] = [];
  const closed = new Map<string, { closedAt?: string; sourceRevision?: string }>();
  const invalid = new Set<string>();
  for (const row of db
    .select()
    .from(appSetting)
    .where(like(appSetting.id, 'month_close.%'))
    .all()) {
    const month = row.id.slice('month_close.'.length);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      unavailable.push({ month: null, reason: 'invalid_state' });
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(row.value);
    } catch {
      invalid.add(month);
      unavailable.push({ month, reason: 'invalid_state' });
      continue;
    }
    const parsed = monthCloseStateSchema.safeParse(value);
    if (!parsed.success || (parsed.data.snapshot && parsed.data.snapshot.month !== month)) {
      invalid.add(month);
      unavailable.push({ month, reason: 'invalid_state' });
      continue;
    }
    if (parsed.data.closedOn) {
      if (!parsed.data.closedAt || !parsed.data.snapshot)
        unavailable.push({ month, reason: 'legacy' });
      else
        closed.set(month, {
          closedAt: parsed.data.closedAt,
          sourceRevision: parsed.data.snapshot.sourceRevision,
        });
    }
  }
  const previous = addMonths(today.slice(0, 7), -1);
  if (
    !invalid.has(previous) &&
    !closed.has(previous) &&
    !unavailable.some((item) => item.month === previous && item.reason === 'legacy')
  ) {
    tasks.push({
      id: `close:${previous}`,
      kind: 'close',
      month: previous,
      target: `/monatsabschluss/${previous}`,
    });
  }
  for (const [month, state] of closed) {
    if (lastDayOfMonth(month) > today) continue;
    const key = `month_close.${month}`;
    const boundary = db.all<{ sequence: number }>(sql`
      SELECT MIN(rowid) AS sequence FROM audit_log
      WHERE entity_type = 'app_setting' AND entity_id = ${key}
        AND json_extract(json_extract(after_json, '$.value'), '$.closedAt') = ${state.closedAt}
        AND json_extract(json_extract(after_json, '$.value'), '$.snapshot.sourceRevision') = ${state.sourceRevision}
    `)[0]?.sequence;
    if (!boundary) {
      unavailable.push({ month, reason: 'legacy' });
      continue;
    }
    const changed = db.all<{ changed: number }>(sql`
      SELECT EXISTS(SELECT 1 FROM audit_log a WHERE a.rowid > ${boundary} AND (
        (a.entity_type = 'booking' AND
          (substr(json_extract(a.before_json, '$.date'), 1, 7) = ${month}
            OR substr(json_extract(a.after_json, '$.date'), 1, 7) = ${month}))
        -- A split uses its parent's latest retained state at the split event. An older
        -- September booking version does not make an October-only split a September change.
        OR (a.entity_type = 'booking_split' AND (
          EXISTS (SELECT 1 FROM audit_log parent WHERE parent.entity_type = 'booking'
            AND parent.entity_id IN
              (json_extract(a.before_json, '$.booking_id'), json_extract(a.after_json, '$.booking_id'))
            AND parent.rowid = (SELECT MAX(latest.rowid) FROM audit_log latest
              WHERE latest.entity_type = 'booking' AND latest.entity_id = parent.entity_id
                AND latest.rowid <= a.rowid)
            AND substr(COALESCE(json_extract(parent.after_json, '$.date'),
              json_extract(parent.before_json, '$.date')), 1, 7) = ${month})
        ))
      )) AS changed
    `)[0]?.changed;
    if (changed)
      tasks.push({
        id: `close-changed:${month}`,
        kind: 'close-changed',
        month,
        target: `/monatsabschluss/${month}`,
      });
  }
  tasks.sort((a, b) => b.month.localeCompare(a.month) || a.id.localeCompare(b.id));
  return { tasks, unavailable };
}
