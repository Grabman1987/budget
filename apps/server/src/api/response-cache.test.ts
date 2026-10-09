import {
  createTestDatabase,
  netWorthAsOf,
  runWithValuationNotes,
  schema,
  sqliteOf,
} from '@budget/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createLedgerApi, warmReadModels } from './index';
import { readModelCache } from './response-cache';

function setup(day = { value: '2026-03-18' }) {
  const { db } = createTestDatabase();
  const clock = { ms: 0 };
  let computed = 0;
  const app = new Hono();
  app.use(
    '*',
    readModelCache(
      db,
      () => day.value,
      () => clock.ms,
    ),
  );
  app.get('/api/heute', (c) => c.json({ n: ++computed }));
  app.get('/api/search', (c) => c.json({ n: ++computed }));
  app.get('/api/portfolio/broken', (c) => c.json({ error: 'x' }, 500));
  app.post('/api/heute', (c) => c.json({ ok: true }));
  const write = (id: string) =>
    sqliteOf(db).prepare('insert into app_setting (id, value) values (?, ?)').run(id, 'v');
  return { app, write, day, clock, computed: () => computed };
}

describe('readModelCache', () => {
  it('keeps cached cash values exact across audited booking, undo, redo and rollback', async () => {
    const opened = createTestDatabase();
    const { db } = opened;
    const day = '2026-03-18';
    db.insert(schema.account)
      .values({
        id: 'cash',
        name: 'Synthetic cash',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-03-01',
        openingBalanceCents: 1_000,
      })
      .run();
    const app = new Hono().route(
      '/api',
      createLedgerApi({ db, today: () => day, bankSync: null, stepUp: async (_c, next) => next() }),
    );
    const selected = vi.spyOn(db, 'select');
    try {
      const read = async (expectedCents: number) => {
        const readCached = async (path: string, verify: (value: unknown) => void) => {
          const before = selected.mock.calls.length;
          const response = await app.request(path);
          expect(response.status).toBe(200);
          const body = await response.text();
          verify(JSON.parse(body) as unknown);
          const readCount = selected.mock.calls.length;
          expect(readCount).toBeGreaterThan(before);
          const repeated = await app.request(path);
          expect(repeated.status).toBe(200);
          expect(await repeated.text()).toBe(body);
          // A hit returns the full financial response without running its SELECT read models.
          expect(selected.mock.calls.length).toBe(readCount);
          return body;
        };
        const netWorth = await readCached('/api/wealth/networth?period=1M', (raw) => {
          const value = raw as { chain: { nowCents: number } };
          expect(value.chain.nowCents).toBe(expectedCents);
        });
        await readCached('/api/heute', (raw) => {
          const value = raw as {
            netWorth: { totalCents: number };
            balance: { actual: { day: string; balanceCents: number }[] };
          };
          expect(value.netWorth.totalCents).toBe(expectedCents);
          expect(value.balance.actual.at(-1)?.balanceCents).toBe(expectedCents);
        });
        return netWorth;
      };
      const post = async (path: string, body: unknown, status: number) => {
        const response = await app.request('/api' + path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        expect(response.status).toBe(status);
        return (await response.json()) as { groupId: string };
      };
      const initial = await read(1_000);
      const booking = await post(
        '/bookings',
        { type: 'booking', accountId: 'cash', date: '2026-03-10', amountCents: 250 },
        201,
      );
      const booked = await read(1_250);
      const undone = await post('/undo', { groupId: booking.groupId }, 200);
      expect(await read(1_000)).toBe(initial);
      await post('/undo', { groupId: undone.groupId }, 200);
      expect(await read(1_250)).toBe(booked);
      // Inject failure at the DB transaction boundary; no production HTTP test hook is needed.
      runWithValuationNotes(() => {
        expect(() =>
          db.transaction((tx) => {
            tx.update(schema.account)
              .set({ openingBalanceCents: 5_000 })
              .where(eq(schema.account.id, 'cash'))
              .run();
            expect(netWorthAsOf(tx, day).totalCents).toBe(5_250);
            throw new Error('synthetic financial rollback');
          }),
        ).toThrow('synthetic financial rollback');
      });
      expect(await read(1_250)).toBe(booked);
    } finally {
      selected.mockRestore();
      opened.close();
    }
  });

  it('serves a repeated read model from memory while nothing was written', async () => {
    const { app, computed } = setup();
    const first = await (await app.request('/api/heute')).json();
    const second = await (await app.request('/api/heute')).json();
    expect(second).toEqual(first);
    expect(computed()).toBe(1);
  });

  it('answers a real request from what the in-process warm-up stored', async () => {
    const { db } = createTestDatabase();
    let computed = 0;
    const api = new Hono();
    api.use(
      '*',
      readModelCache(
        db,
        () => '2026-03-18',
        () => 0,
      ),
    );
    api.get('/heute', (c) => c.json({ n: ++computed }));
    const app = new Hono().route('/api', api);
    expect(await warmReadModels(api, () => '2026-03-18')).toBe(2);
    expect(computed).toBe(2); // month and payday
    const real = await app.request('https://budget.example/api/heute?period=month&month=2026-03');
    expect(await real.json()).toEqual({ n: 1 });
    expect(computed).toBe(2);
  });

  it('does not count the uncached inbox badge as warmed and recomputes its real route on a second call', async () => {
    const opened = createTestDatabase();
    const { db } = opened;
    const api = createLedgerApi({
      db,
      today: () => '2026-03-18',
      bankSync: null,
      stepUp: async (_c, next) => next(),
    });
    const app = new Hono().route('/api', api);
    const transaction = vi.spyOn(db, 'transaction');

    try {
      const warmed = await warmReadModels(api, () => '2026-03-18');
      const afterWarm = transaction.mock.calls.length;
      const first = await app.request('/api/inbox/count');
      expect(first.status).toBe(200);
      const firstCount = await first.json();
      const afterFirst = transaction.mock.calls.length;
      const second = await app.request('/api/inbox/count');
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual(firstCount);
      const afterSecond = transaction.mock.calls.length;

      expect(afterFirst).toBe(afterWarm + 1);
      expect(afterSecond).toBe(afterFirst + 1);
      expect(warmed).toBe(2);
    } finally {
      transaction.mockRestore();
      opened.close();
    }
  });

  it('keys the answer by query string', async () => {
    const { app, computed } = setup();
    await app.request('/api/heute?period=month');
    await app.request('/api/heute?period=payday');
    expect(computed()).toBe(2);
  });

  it('recomputes after any write to the database', async () => {
    const { app, write, computed } = setup();
    await app.request('/api/heute');
    write('a');
    const after = await (await app.request('/api/heute')).json();
    expect(after).toEqual({ n: 2 });
    await app.request('/api/heute');
    expect(computed()).toBe(2);
  });

  it('recomputes on the next day and after the maximum age', async () => {
    const { app, day, clock, computed } = setup();
    await app.request('/api/heute');
    day.value = '2026-03-19';
    await app.request('/api/heute');
    expect(computed()).toBe(2);
    clock.ms += 31 * 60_000;
    await app.request('/api/heute');
    expect(computed()).toBe(3);
  });

  it('never caches routes outside the allow-list, writes or failures', async () => {
    const { app, computed } = setup();
    await app.request('/api/search');
    await app.request('/api/search');
    expect(computed()).toBe(2);
    expect((await app.request('/api/portfolio/broken')).status).toBe(500);
    expect((await app.request('/api/portfolio/broken')).status).toBe(500);
    expect((await app.request('/api/heute', { method: 'POST' })).status).toBe(200);
  });
});
