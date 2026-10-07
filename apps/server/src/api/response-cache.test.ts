import { createTestDatabase, sqliteOf } from '@budget/db';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { warmReadModels } from './index';
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
    expect(await warmReadModels(api, () => '2026-03-18')).toBeGreaterThanOrEqual(2);
    expect(computed).toBe(2); // month and payday
    const real = await app.request('https://budget.example/api/heute?period=month&month=2026-03');
    expect(await real.json()).toEqual({ n: 1 });
    expect(computed).toBe(2);
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
