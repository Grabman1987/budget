import { randomUUID } from 'node:crypto';
import { matchOccurrences, refreshOccurrences, type Db } from '@budget/db';
import { todayInVienna } from '@budget/domain';

export const EXPECTED_MATCH_FIRST_MS = 2 * 60_000;
export const EXPECTED_MATCH_EVERY_MS = 6 * 3_600_000;

/** Same work as POST /api/expected/refresh, run by the server itself (#1376). Never throws. */
export function runExpectedMatch(db: Db, now: Date = new Date()): boolean {
  try {
    const ctx = { actor: 'system', groupId: randomUUID() };
    const today = todayInVienna(now);
    refreshOccurrences(db, today, ctx);
    matchOccurrences(db, today, ctx);
    return true;
  } catch (error) {
    console.error(
      `Expected-payment matching failed: ${error instanceof Error ? error.name : 'error'}; will retry`,
    );
    return false;
  }
}

/** First run 2 min after start, then every 6 h. Timers are unref'd; returns a stop function. */
export function startExpectedMatchTimer(db: Db, run: () => unknown = () => runExpectedMatch(db)) {
  const timers = [
    setTimeout(run, EXPECTED_MATCH_FIRST_MS),
    setInterval(run, EXPECTED_MATCH_EVERY_MS),
  ];
  for (const timer of timers) timer.unref();
  return () => {
    for (const timer of timers) clearTimeout(timer);
  };
}
