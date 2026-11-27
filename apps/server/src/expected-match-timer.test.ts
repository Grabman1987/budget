import { afterEach, expect, it, vi } from 'vitest';
import { createTestDatabase } from '@budget/db';
import {
  EXPECTED_MATCH_EVERY_MS,
  EXPECTED_MATCH_FIRST_MS,
  EXPECTED_MATCH_RETRY_MS,
  runExpectedMatch,
  startExpectedMatchTimer,
} from './expected-match-timer';

afterEach(() => vi.useRealTimers());

it('runs 2 minutes after start, then every 6 hours, and stops cleanly', () => {
  vi.useFakeTimers();
  const run = vi.fn();
  const stop = startExpectedMatchTimer(createTestDatabase().db, run);
  vi.advanceTimersByTime(EXPECTED_MATCH_FIRST_MS - 1);
  expect(run).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(run).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(EXPECTED_MATCH_EVERY_MS);
  expect(run).toHaveBeenCalledTimes(2);
  stop();
  vi.advanceTimersByTime(EXPECTED_MATCH_EVERY_MS * 2);
  expect(run).toHaveBeenCalledTimes(2);
});

it('runs refresh and match on an empty ledger and never throws on failure', () => {
  const { db } = createTestDatabase();
  expect(runExpectedMatch(db, new Date('2026-10-15T10:00:00Z'))).toBe(true);
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(runExpectedMatch({} as never)).toBe(false);
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});

it('retries a failed run once after 10 minutes', () => {
  vi.useFakeTimers();
  const run = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
  const stop = startExpectedMatchTimer(createTestDatabase().db, run);
  vi.advanceTimersByTime(EXPECTED_MATCH_FIRST_MS);
  expect(run).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(EXPECTED_MATCH_RETRY_MS);
  expect(run).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(EXPECTED_MATCH_RETRY_MS * 3);
  expect(run).toHaveBeenCalledTimes(2);
  stop();
});

it('logs the SQLite error code, not the message', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const busy = Object.assign(new Error('secret detail'), {
    name: 'SqliteError',
    code: 'SQLITE_BUSY',
  });
  const db = new Proxy(
    {},
    {
      get: () => {
        throw busy;
      },
    },
  );
  expect(runExpectedMatch(db as never)).toBe(false);
  const line = String(error.mock.calls[0]?.[0]);
  expect(line).toContain('SqliteError (SQLITE_BUSY)');
  expect(line).not.toContain('secret');
  error.mockRestore();
});
