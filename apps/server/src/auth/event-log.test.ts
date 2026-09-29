import { createTestDatabase, schema } from '@budget/db';
import { describe, expect, it } from 'vitest';
import { AuthEventLog } from './event-log';
import { AuthStore, DETAIL_MAX } from './store';

const MINUTE = 60_000;
const DAY = 86_400_000;
const T0 = Date.parse('2026-09-29T10:00:00Z');
const at = (ms: number) => new Date(T0 + ms);

function setup() {
  const { db } = createTestDatabase();
  const store = new AuthStore(db);
  const log = new AuthEventLog(store);
  const rows = () => db.select().from(schema.authEvent).all();
  return { store, log, rows };
}

describe('AuthEventLog', () => {
  it('merges repeated rejections of one client into one row per 10 minutes with a counter', () => {
    const { log, rows } = setup();
    for (let i = 0; i < 10_000; i++)
      log.reject('origin_rejected', at(i * 50), { ipHash: 'aaaaaaaaaaaa', detail: 'x' });
    // 10,000 × 50 ms = 500 s: all inside one window.
    log.flush(at(10_000 * 50));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ kind: 'origin_rejected', count: 10_000 });
    expect(rows()[0]?.lastTs).toBe(at(9_999 * 50).toISOString());
  });

  it('10,000 rejections from 10,000 addresses produce a bounded number of rows', () => {
    const { log, rows } = setup();
    for (let i = 0; i < 10_000; i++)
      log.reject('login_failed', at(i), { ipHash: i.toString(16).padStart(12, '0') });
    log.flush(at(10_000));
    const all = rows();
    // 12 rows with their own IP hash, then one shared row that counts the rest.
    expect(all).toHaveLength(13);
    const shared = all.find((r) => r.ipHash === null);
    expect(shared?.count).toBe(10_000 - 12);
    expect(all.reduce((sum, r) => sum + r.count, 0)).toBe(10_000);
  });

  it('opens a new row after the window, and writes counters back at most once a minute', () => {
    const { log, rows } = setup();
    log.reject('rate_limited', at(0), { ipHash: 'b', detail: 'attempts' });
    log.reject('rate_limited', at(10_000), { ipHash: 'b' });
    expect(rows()[0]?.count).toBe(1); // pending in memory
    log.reject('rate_limited', at(MINUTE + 1), { ipHash: 'b' });
    expect(rows()[0]?.count).toBe(3);
    log.reject('rate_limited', at(11 * MINUTE), { ipHash: 'b' });
    expect(rows()).toHaveLength(2);
  });

  it('cuts every detail to 100 characters and removes control characters', () => {
    const { store, log, rows } = setup();
    log.reject('origin_rejected', at(0), { ipHash: 'c', detail: `https://${'a'.repeat(16_000)}` });
    store.logEvent('login_ok', at(0), { detail: 'line\nbreak' });
    expect(rows().map((r) => r.detail?.length)).toEqual([DETAIL_MAX, 10]);
    expect(rows()[1]?.detail).toBe('line?break');
  });

  it('prunes rows older than 180 days', () => {
    const { store, log, rows } = setup();
    store.logEvent('login_ok', at(0));
    store.logEvent('login_ok', at(100 * DAY));
    expect(log.prune(at(181 * DAY))).toBe(1);
    expect(rows()).toHaveLength(1);
  });
});
