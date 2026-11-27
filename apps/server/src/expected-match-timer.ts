import { randomUUID } from 'node:crypto';
import { matchOccurrences, refreshOccurrences, type Db } from '@budget/db';
import { todayInVienna } from '@budget/domain';

export const EXPECTED_MATCH_FIRST_MS = 2 * 60_000;
export const EXPECTED_MATCH_EVERY_MS = 6 * 3_600_000;
/** A failed run (e.g. SQLITE_BUSY while another connection writes) is tried again this much later. */
export const EXPECTED_MATCH_RETRY_MS = 10 * 60_000;

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
      `Expected-payment matching failed: ${error instanceof Error ? error.name : 'error'}${codeOf(error)}; will retry`,
    );
    return false;
  }
}

/** SQLite's error code (e.g. SQLITE_BUSY) without the message, which may quote data. */
const codeOf = (error: unknown): string => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? ` (${code})` : '';
};

/**
 * First run 2 min after start, then every 6 h; a failed run is retried once after 10 min.
 * Timers are unref'd; returns a stop function.
 */
export function startExpectedMatchTimer(db: Db, run: () => unknown = () => runExpectedMatch(db)) {
  let retry: ReturnType<typeof setTimeout> | undefined;
  const attempt = () => {
    if (run() !== false || retry) return;
    retry = setTimeout(() => {
      retry = undefined;
      run();
    }, EXPECTED_MATCH_RETRY_MS);
    retry.unref();
  };
  const timers = [
    setTimeout(attempt, EXPECTED_MATCH_FIRST_MS),
    setInterval(attempt, EXPECTED_MATCH_EVERY_MS),
  ];
  for (const timer of timers) timer.unref();
  return () => {
    for (const timer of timers) clearTimeout(timer);
    if (retry) clearTimeout(retry);
  };
}
