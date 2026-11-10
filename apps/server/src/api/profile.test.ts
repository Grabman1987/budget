import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createTestDatabase, undo } from '@budget/db';
import { Hono } from 'hono';
import { createApp, type AuthGate } from '../app';
import { errorResponse } from './http';
import { profileRoutes } from './profile';

const opened = createTestDatabase();
afterAll(() => opened.close());
afterEach(() => {
  opened.sqlite.exec('DELETE FROM app_setting; DELETE FROM audit_log;');
});

describe('profile API', () => {
  const app = profileRoutes(opened.db, () => '2026-10-02');
  app.onError(errorResponse);
  const patch = (body: unknown) =>
    app.request('/', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('is generic by default and stores and audits what the owner enters', async () => {
    expect(await (await app.request('/')).json()).toEqual({
      name: '',
      initials: '',
      birthDate: '',
      household: null,
      region: null,
      risk: {
        horizon: null,
        liquidity: null,
        reserve: null,
        income: null,
        lossReaction: null,
        acceptableLoss: null,
      },
      family: {
        partnership: null,
        partnerIncome: null,
        dependants: null,
        children: null,
        support: null,
      },
    });
    const res = await patch({
      name: 'Beispiel Person',
      initials: 'bp',
      birthDate: '1985-04-12',
      household: 3,
      region: 'AT-9',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      name: 'Beispiel Person',
      initials: 'BP',
      birthDate: '1985-04-12',
      household: 3,
      region: 'AT-9',
      groupId: expect.any(String),
    });
    const audit = opened.sqlite
      .prepare("SELECT entity_type, action FROM audit_log WHERE entity_type = 'app_setting'")
      .all();
    expect(audit).toHaveLength(5);
    // Unchanged values write nothing; clearing a value is an update.
    await patch({ name: 'Beispiel Person', region: null });
    const after = opened.sqlite
      .prepare("SELECT count(*) AS n FROM audit_log WHERE entity_type = 'app_setting'")
      .get() as { n: number };
    expect(after.n).toBe(6);
    expect(await (await app.request('/')).json()).toMatchObject({ region: null, household: 3 });
  });

  it('stores risk answers per question, audits and undoes them, keeps omitted ones', async () => {
    const first = await patch({ risk: { horizon: 'gt15', lossReaction: 'hold' } });
    expect(first.status).toBe(200);
    const saved = (await first.json()) as { groupId: string };
    await patch({ risk: { lossReaction: 'buyMore', reserve: '3to6' } });
    expect(await (await app.request('/')).json()).toMatchObject({
      risk: { horizon: 'gt15', lossReaction: 'buyMore', reserve: '3to6', income: null },
    });
    const n = opened.sqlite
      .prepare("SELECT count(*) AS n FROM audit_log WHERE entity_type = 'app_setting'")
      .get() as { n: number };
    expect(n.n).toBe(4); // 2 creates, then 1 update and 1 create
    // Clearing an answer back to "no answer" is an update, not a default.
    const cleared = (await (await patch({ risk: { horizon: null } })).json()) as {
      groupId: string;
    };
    expect(await (await app.request('/')).json()).toMatchObject({ risk: { horizon: null } });
    // Undo is conflict-protected: the first save was changed afterwards, so it cannot be undone.
    expect(() => undo(opened.db, { groupId: saved.groupId }, { actor: 't' })).toThrow(/changed/);
    undo(opened.db, { groupId: cleared.groupId }, { actor: 't' });
    expect(await (await app.request('/')).json()).toMatchObject({
      risk: { horizon: 'gt15', lossReaction: 'buyMore' },
    });
  });

  it('rejects invalid risk answers', async () => {
    expect((await patch({ risk: { horizon: 'medium' } })).status).toBe(400);
    expect((await patch({ risk: { unknownQuestion: 'p10' } })).status).toBe(400);
    expect((await patch({ risk: 'high' })).status).toBe(400);
    expect(await (await app.request('/')).json()).toMatchObject({ risk: { horizon: null } });
  });

  it('stores family facts per field, audits and undoes them, keeps omitted ones', async () => {
    const first = await patch({ family: { partnership: 'partner', dependants: 0 } });
    expect(first.status).toBe(200);
    const firstGroup = ((await first.json()) as { groupId: string }).groupId;
    await patch({ family: { dependants: 2, children: 1, support: 'some' } });
    expect(await (await app.request('/')).json()).toMatchObject({
      family: {
        partnership: 'partner',
        partnerIncome: null,
        dependants: 2,
        children: 1,
        support: 'some',
      },
    });
    const cleared = await patch({ family: { children: null } });
    expect(cleared.status).toBe(200);
    const clearedGroup = ((await cleared.json()) as { groupId: string }).groupId;
    expect(await (await app.request('/')).json()).toMatchObject({
      family: { dependants: 2, children: null },
    });
    const audit = opened.sqlite
      .prepare("SELECT action FROM audit_log WHERE entity_id LIKE 'profile.family.%'")
      .all();
    expect(audit.length).toBeGreaterThanOrEqual(5);
    // Undo is conflict-protected: the first save was changed afterwards.
    expect(() => undo(opened.db, { groupId: firstGroup }, { actor: 'test' })).toThrow(/changed/);
    undo(opened.db, { groupId: clearedGroup }, { actor: 'test' });
    expect(await (await app.request('/')).json()).toMatchObject({
      family: { partnership: 'partner', dependants: 2, children: 1 },
    });
  });

  it('rejects invalid family input', async () => {
    expect((await patch({ family: {} })).status).toBe(400);
    expect((await patch({ family: { partnership: 'married' } })).status).toBe(400);
    expect((await patch({ family: { dependants: -1 } })).status).toBe(400);
    expect((await patch({ family: { dependants: 11 } })).status).toBe(400);
    expect((await patch({ family: { dependants: 1.5 } })).status).toBe(400);
    expect((await patch({ family: { childName: 'x' } })).status).toBe(400);
    expect((await patch({ family: 'none' })).status).toBe(400);
    expect((await patch({ family: { dependants: 1, children: 2 } })).status).toBe(422);
    expect(await (await app.request('/')).json()).toMatchObject({ family: { dependants: null } });
  });

  it('rejects invalid values', async () => {
    expect((await patch({})).status).toBe(400);
    expect((await patch({ unknown: 1 })).status).toBe(400);
    expect((await patch({ region: 'AT-12' })).status).toBe(400);
    expect((await patch({ household: 0 })).status).toBe(400);
    expect((await patch({ birthDate: '2027-01-01' })).status).toBe(422);
    expect((await patch({ birthDate: '1990-02-30' })).status).toBe(422);
    expect((await patch({ initials: 'ABCD' })).status).toBe(422);
    expect(await (await app.request('/')).json()).toMatchObject({ name: '', birthDate: '' });
  });
});

describe('profile API behind the session guard', () => {
  it('refuses reads and risk writes without a session or from a foreign origin', async () => {
    const db = createTestDatabase();
    try {
      let authenticated = false;
      const auth: AuthGate = {
        routes: new Hono(),
        originGuard: async (c, next) =>
          c.req.method === 'GET' || c.req.header('origin') === 'https://budget.example'
            ? next()
            : c.json({ error: 'origin_rejected' }, 403),
        requireSession: async (c, next) =>
          authenticated ? next() : c.json({ error: 'unauthorized' }, 401),
        requireStepUp: async (_c, next) => next(),
      };
      const app = createApp({
        webDir: 'test-results/no-web',
        auth,
        ledger: { db: db.db, today: () => '2026-10-02' },
      });
      const write = (origin: string) =>
        app.request('/api/profile', {
          method: 'PATCH',
          headers: { origin, 'content-type': 'application/json' },
          body: JSON.stringify({ risk: { horizon: 'gt15' }, family: { dependants: 0 } }),
        });
      expect((await write('https://budget.example')).status).toBe(401);
      expect((await app.request('/api/profile')).status).toBe(401);
      authenticated = true;
      expect((await write('https://other.example')).status).toBe(403);
      expect(db.sqlite.prepare('SELECT count(*) AS n FROM app_setting').get()).toEqual({ n: 0 });
      expect((await write('https://budget.example')).status).toBe(200);
    } finally {
      db.close();
    }
  });
});
