import { capturePlanSnapshot, schema, writesHeld, type Db } from '@budget/db';
import { monthOf, monthsBetween, todayInVienna } from '@budget/domain';

/** Same nightly Vienna slot as prices, independent of provider configuration. */
export function startPlanSnapshotTimer(
  db: Db,
  onError: () => void = () => console.error('Plan snapshot failed; will retry'),
) {
  let completedDay: string | undefined;
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
    try {
      const first = db
        .select()
        .from(schema.account)
        .all()
        .filter((a) => a.onBudget && a.role === 'budget' && !a.deletedAt)
        .map((a) => monthOf(a.openingDate))
        .sort()[0];
      if (first)
        for (const month of monthsBetween(first, monthOf(day))) capturePlanSnapshot(db, month, day);
      completedDay = day;
    } catch {
      onError();
    }
  };
  tick();
  const timer = setInterval(tick, 5 * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
