import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { Hono } from 'hono';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { securityRoutes } from './invest';
import { errorResponse } from './http';
import { undoRoutes } from './lookups';

let opened: OpenedDatabase;
let app: Hono;
let signedIn: boolean;
beforeEach(() => {
  opened = createTestDatabase();
  opened.db
    .insert(schema.assetClass)
    .values([
      { id: 'a', name: 'Klasse A' },
      { id: 'b', name: 'Klasse B' },
    ])
    .run();
  opened.db
    .insert(schema.security)
    .values({ id: 's', name: 'Musterfonds', kind: 'fund', assetClassId: 'a' })
    .run();
  signedIn = true;
  app = new Hono();
  app.use('*', async (c, next) => (signedIn ? next() : c.json({ error: 'unauthorized' }, 401)));
  app.use('*', async (c, next) =>
    c.req.header('origin') === 'https://foreign.invalid'
      ? c.json({ error: 'origin' }, 403)
      : next(),
  );
  app.onError(errorResponse);
  app.route(
    '/securities',
    securityRoutes(opened.db, () => '2026-10-04'),
  );
  app.route('/undo', undoRoutes(opened.db));
});
afterEach(() => opened.close());
const payload = {
  complete: true,
  source: 'manual',
  weights: [
    { assetClassId: 'a', weightBp: 6000 },
    { assetClassId: 'b', weightBp: 4000 },
  ],
};
const call = (method: string, path: string, body?: unknown, origin?: string) =>
  app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const read = async (asOf: string) =>
  (await (await call('GET', `/securities/s/exposures?asOf=${asOf}`)).json()) as {
    exposure: { validFrom: string | null; weights: { assetClassId: string; weightBp: number }[] };
  };

it('reads inclusive effective versions and uses the injected today default; same-day replacement is undoable', async () => {
  const saved = await call('PUT', '/securities/s/exposures', payload);
  expect(saved.status).toBe(200);
  const first = (await saved.json()) as { groupId: string };
  expect((await read('2026-10-03')).exposure.weights).toEqual([]);
  expect((await read('2026-10-04')).exposure).toMatchObject({
    validFrom: '2026-10-04',
    weights: payload.weights,
  });
  const replaced = await call('PUT', '/securities/s/exposures', {
    ...payload,
    weights: [{ assetClassId: 'b', weightBp: 10000 }],
  });
  const group = (await replaced.json()) as { groupId: string };
  expect(replaced.status).toBe(200);
  const undone = await call('POST', '/undo', { groupId: group.groupId });
  expect(undone.status).toBe(200);
  expect((await read('2026-10-04')).exposure.weights).toEqual(payload.weights);
  const undoGroup = (await undone.json()) as { groupId: string };
  await call('POST', '/undo', { groupId: undoGroup.groupId });
  expect((await read('2026-10-04')).exposure.weights).toEqual([
    { assetClassId: 'b', weightBp: 10000 },
  ]);
  expect(first.groupId).not.toBe(group.groupId);
});

it('rejects invalid writes atomically with German messages and no database identifiers', async () => {
  for (const input of [
    { ...payload, complete: undefined },
    { ...payload, validFrom: '2026-02-30' },
    { ...payload, validFrom: '2026-99-99' },
    { ...payload, weights: [{ assetClassId: 'a', weightBp: 9999 }] },
    { ...payload, weights: [{ assetClassId: 'missing', weightBp: 10000 }] },
    { ...payload, weights: [{ assetClassId: 'a', weightBp: 1.5 }] },
  ]) {
    const response = await call('PUT', '/securities/s/exposures', input);
    expect([400, 422]).toContain(response.status);
    const body = (await response.json()) as { message: string };
    expect(body.message).toMatch(/Bitte|Klassengewichte/);
    expect(body.message).not.toMatch(/missing|security_|asset_class|stack/i);
    expect(opened.db.select().from(schema.securityExposureVersion).all()).toEqual([]);
    expect(opened.db.select().from(schema.auditLog).all()).toEqual([]);
  }
  const invalidRead = await call('GET', '/securities/s/exposures?asOf=2026-99-99');
  expect(invalidRead.status).toBe(400);
  const invalidMessage = (await invalidRead.json()) as { message: string };
  expect(invalidMessage.message).toContain('gültiges Bewertungsdatum');
});

it('preserves the session and origin boundaries for exposure reads and writes', async () => {
  expect(
    (await call('PUT', '/securities/s/exposures', payload, 'https://foreign.invalid')).status,
  ).toBe(403);
  signedIn = false;
  expect((await call('GET', '/securities/s/exposures')).status).toBe(401);
  expect((await call('PUT', '/securities/s/exposures', payload)).status).toBe(401);
  expect(opened.db.select().from(schema.auditLog).all()).toEqual([]);
});
