import { randomUUID } from 'node:crypto';
import { capturePlanSnapshot, insertTracked, schema, writesHeld, type Db } from '@budget/db';
import { and, eq, isNull } from 'drizzle-orm';
import { addMonths, monthOf, monthsBetween, todayInVienna } from '@budget/domain';

const AUTO_BACKFILL_MONTHS = 2;
const MAX_ATTEMPTS_PER_DAY = 3;

/** One open, generic warning at a time (no amounts, no error text). */
function planSnapshotWarning(db: Db) {
  console.error('Plan snapshot failed repeatedly; giving up for today');
  const { inboxItem } = schema;
  if (
    db
      .select()
      .from(inboxItem)
      .where(and(eq(inboxItem.refType, 'plan-snapshot'), isNull(inboxItem.resolvedAt)))
      .get()
  )
    return;
  insertTracked(
    db,
    inboxItem,
    {
      id: randomUUID(),
      kind: 'revision',
      title: 'Budgettreue-Schnappschuss fehlgeschlagen',
      detail: 'Der Schnappschuss vom 15. konnte heute nicht gespeichert werden.',
      refType: 'plan-snapshot',
      urgent: false,
    },
    { actor: 'system' },
  );
}

/** Same nightly Vienna slot as prices, independent of provider configuration. */
export function startPlanSnapshotTimer(
  db: Db,
  onError: () => void = () => planSnapshotWarning(db),
) {
  let completedDay: string | undefined;
  let attempts = 0;
  let attemptDay: string | undefined;
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Vienna',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const tick = () => {
    const now = new Date();
    const day = todayInVienna(now);
    if (completedDay === day || time.format(now) < '02:30' || writesHeld(db)) return;
    if (attemptDay !== day) [attemptDay, attempts] = [day, 0];
    let failed = false;
    try {
      const first = db
        .select()
        .from(schema.account)
        .all()
        .filter((a) => a.onBudget && a.role === 'budget' && !a.deletedAt)
        .map((a) => monthOf(a.openingDate))
        .sort()[0];
      if (first) {
        // Automatic backfill reaches back two months only; older ones are an operator job
        // (scripts/plan-snapshot.ts, docs/ops.md).
        const current = monthOf(day);
        const from = addMonths(current, -AUTO_BACKFILL_MONTHS);
        for (const month of monthsBetween(first > from ? first : from, current))
          try {
            capturePlanSnapshot(db, month, day);
          } catch {
            failed = true;
          }
      }
    } catch {
      failed = true;
    }
    if (!failed) completedDay = day;
    else if (++attempts >= MAX_ATTEMPTS_PER_DAY) {
      completedDay = day;
      onError();
    }
  };
  tick();
  const timer = setInterval(tick, 5 * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
