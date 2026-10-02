import {
  readSourceState,
  stageSourcePage,
  finishReadSource,
  failReadSource,
  writesHeld,
  type Db,
} from '@budget/db';
import { addDays, todayInVienna, type ReadSource } from '@budget/domain';
import { ApiError } from '../api/http';
import { viennaMinutes, NIGHTLY_AT_MINUTES } from '../market/timer';
const running = new WeakSet<Db>();
export const readSourceRunning = (db: Db) => running.has(db);

/** One bounded page per call: cursor + inbox changes commit atomically, no network inside SQLite. */
export async function refreshReadSource(
  db: Db,
  source: ReadSource,
  now = new Date(),
  fullHistory = false,
) {
  if (!source.configured())
    throw new ApiError(409, 'source_unconfigured', 'Schlüssel nicht gesetzt.');
  if (running.has(db) || writesHeld(db))
    throw new ApiError(409, 'source_busy', 'Abruf oder Datenübernahme läuft bereits.');
  running.add(db);
  try {
    const state = readSourceState(db);
    const at = now.toISOString();
    // Replay overlap catches late arrivals and changes; a bounded window avoids moving pagination.
    const window = (!fullHistory && state.window) || {
      from:
        !fullHistory && state.lastSuccess
          ? new Date(Date.parse(state.lastSuccess) - 7 * 86400000).toISOString()
          : '1970-01-01T00:00:00.000Z',
      to: at,
      cursor: null,
      complete: false,
      seen: [] as string[],
    };
    const page = window.complete
      ? { operations: [], nextCursor: null }
      : await source.operations(window);
    if (
      page.nextCursor &&
      (window.seen?.includes(page.nextCursor) || (window.seen?.length ?? 0) >= 10000)
    )
      throw new Error('source_failed');
    if (writesHeld(db)) throw new ApiError(409, 'source_busy', 'Datenübernahme läuft.');
    stageSourcePage(
      db,
      page.operations,
      {
        ...state,
        status: 'partial',
        lastAttempt: at,
        window: {
          ...window,
          cursor: page.nextCursor,
          complete: !page.nextCursor,
          seen: page.nextCursor ? [...(window.seen ?? []), page.nextCursor] : (window.seen ?? []),
        },
      },
      { actor: 'system' },
    );
    if (page.nextCursor) return { status: 'partial' as const };
    const balances = await source.balances();
    if (writesHeld(db)) throw new ApiError(409, 'source_busy', 'Datenübernahme läuft.');
    finishReadSource(db, balances, at, { actor: 'system' });
    return { status: 'ok' as const };
  } catch (error) {
    if (!writesHeld(db)) failReadSource(db, now.toISOString());
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      422,
      'source_failed',
      'Abruf fehlgeschlagen. Schlüssel, Leserechte und Verbindung prüfen.',
    );
  } finally {
    running.delete(db);
  }
}

export async function refreshReadSourceIfDue(db: Db, source: ReadSource, now: Date) {
  if (!source.configured() || writesHeld(db) || running.has(db)) return;
  const state = readSourceState(db);
  const last = state.lastAttempt ? Date.parse(state.lastAttempt) : 0;
  const delay = state.status === 'failed' ? 30 * 60_000 : 60_000;
  if (now.getTime() - last < delay) return;
  if (
    !state.window &&
    state.lastSuccess &&
    (todayInVienna(new Date(state.lastSuccess)) === todayInVienna(now) ||
      (todayInVienna(new Date(state.lastSuccess)) >= addDays(todayInVienna(now), -1) &&
        viennaMinutes(now) < NIGHTLY_AT_MINUTES))
  )
    return;
  try {
    await refreshReadSource(db, source, now);
  } catch {
    /* Sanitized failure is in the inbox. */
  }
}
