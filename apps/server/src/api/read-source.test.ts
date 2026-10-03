import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
import { Hono } from 'hono';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createApp, type AuthGate } from '../app';
let opened: OpenedDatabase;
let session = true;
let stepUp = true;
let app: ReturnType<typeof createApp>;
const auth: AuthGate = {
  routes: new Hono(),
  originGuard: async (c, next) =>
    c.req.method !== 'GET' && c.req.header('origin') !== 'https://app.test'
      ? c.json({ error: 'origin' }, 403)
      : next(),
  requireSession: async (c, next) => (session ? next() : c.json({ error: 'unauthorized' }, 401)),
  requireStepUp: async (c, next) => (stepUp ? next() : c.json({ error: 'step_up_required' }, 403)),
};
beforeEach(() => {
  opened = createTestDatabase();
  session = true;
  stepUp = true;
  vi.stubEnv('CRYPTO_API_KEY', '');
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockRejectedValue(new Error('network disabled in tests')),
  );
  app = createApp({ webDir: 'apps/web/dist', auth, ledger: { db: opened.db } });
});
afterEach(() => {
  opened.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const post = (path: string, body = {}) =>
  app.request('/api/sources/crypto' + path, {
    method: 'POST',
    headers: { origin: 'https://app.test', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
it('mounts status and all mutations behind session/origin and requires step-up for refresh and mapping', async () => {
  session = false;
  expect((await app.request('/api/sources/crypto')).status).toBe(401);
  expect((await post('/refresh')).status).toBe(401);
  session = true;
  stepUp = false;
  expect((await post('/refresh')).status).toBe(403);
  expect(
    (
      await app.request('/api/sources/crypto/mapping', {
        method: 'PUT',
        headers: { origin: 'https://app.test' },
      })
    ).status,
  ).toBe(403);
  stepUp = true;
  expect((await app.request('/api/sources/crypto/refresh', { method: 'POST' })).status).toBe(403);
  expect((await post('/refresh', { key: 'should-not-be-accepted' })).status).toBe(400);
  expect((await post('/refresh')).status).toBe(409);
});
it('reports only a key boolean and never persists credentials, upstream bodies or writes budget data', async () => {
  vi.stubEnv('CRYPTO_API_KEY', 'synthetic-key-only');
  vi.stubEnv('CRYPTO_API_BASE_URL', 'https://source.example.test');
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('synthetic-private-error', { status: 401 }));
  vi.stubGlobal('fetch', request);
  app = createApp({ webDir: 'apps/web/dist', auth, ledger: { db: opened.db } });
  const status = (await (await app.request('/api/sources/crypto')).json()) as {
    configured: boolean;
  };
  expect(status.configured).toBe(true);
  const response = await post('/refresh');
  expect(response.status).toBe(422);
  expect(await response.text()).not.toMatch(/synthetic-key-only|synthetic-private-error/);
  const persisted = JSON.stringify([
    opened.db.select().from(schema.appSetting).all(),
    opened.db.select().from(schema.inboxItem).all(),
    opened.db.select().from(schema.auditLog).all(),
  ]);
  expect(persisted).not.toMatch(/synthetic-key-only|synthetic-private-error/);
  expect(opened.db.select().from(schema.booking).all()).toHaveLength(0);
  expect(request).toHaveBeenCalledTimes(1);
  expect(JSON.parse(opened.db.select().from(schema.inboxItem).all()[0]!.detail!)).toEqual({
    category: 'http',
  });
});
