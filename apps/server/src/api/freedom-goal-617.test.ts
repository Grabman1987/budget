import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, saveProfile, type OpenedDatabase } from '@budget/db';
import type { FreedomGoalState, FreedomGoalWrite } from '@budget/domain';
import { Hono } from 'hono';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AuthGate } from '../app';

let opened: OpenedDatabase;
let app: ReturnType<typeof createApp>;
let directory: string;
let signedIn = true;
let originAllowed = true;
const today = '2026-10-19';
beforeEach(() => {
  opened = createTestDatabase();
  directory = mkdtempSync(join(tmpdir(), 'budget-goal-api-617-'));
  writeFileSync(join(directory, 'index.html'), '<!doctype html><title>Synthetic</title>');
  signedIn = originAllowed = true;
  // Inject credential decisions only; the real app must mount the new route behind both gates.
  const auth: AuthGate = {
    routes: new Hono(),
    requireStepUp: async (_c, next) => next(),
    requireSession: async (c, next) => (signedIn ? next() : c.json({ error: 'unauthorized' }, 401)),
    originGuard: async (c, next) =>
      originAllowed || c.req.method === 'GET' ? next() : c.json({ error: 'origin_rejected' }, 403),
  };
  app = createApp({ webDir: directory, auth, ledger: { db: opened.db, today: () => today } });
});
afterEach(() => {
  opened.close();
  rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});
const get = async () =>
  (await (await app.request('/api/wealth/freedom/goal')).json()) as FreedomGoalState;
const post = (path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('private personal-goal HTTP boundary (#617)', () => {
  it('reloads the canonical saved goal and preserves real grouped undo/redo and stale-token refusal', async () => {
    const initial = await get();
    const response = await post('/api/wealth/freedom/goal', {
      kind: 'year',
      year: 2050,
      revision: initial.revision,
    });
    expect(response.status).toBe(200);
    const saved = (await response.json()) as FreedomGoalWrite;
    expect((await get()).goalYear).toBe(2050);
    expect(
      (
        await post('/api/wealth/freedom/goal', {
          kind: 'year',
          year: 2050,
          revision: initial.revision,
        })
      ).status,
    ).toBe(409);
    const reverse = await post('/api/undo', { groupId: saved.groupId });
    expect(reverse.status).toBe(200);
    expect((await get()).goalYear).toBeNull();
    expect((await get()).revision).not.toBe(initial.revision);
    const undone = (await reverse.json()) as { groupId: string };
    expect((await post('/api/undo', { groupId: undone.groupId })).status).toBe(200);
    expect((await get()).goalYear).toBe(2050);
  });

  it('does not expose raw synthetic DOB and rejects old-profile age decisions without logging inputs', async () => {
    saveProfile(opened.db, { birthDate: '1980-06-15' }, { actor: 'synthetic' }, today);
    const info = vi.spyOn(console, 'info');
    const log = vi.spyOn(console, 'log');
    const warn = vi.spyOn(console, 'warn');
    const error = vi.spyOn(console, 'error');
    const state = await get();
    expect(JSON.stringify(state)).not.toContain('1980-06-15');
    expect(state).not.toHaveProperty('birthDate');
    expect(state).not.toHaveProperty('birthYear');
    saveProfile(opened.db, { birthDate: '1981-06-15' }, { actor: 'synthetic' }, today);
    const failed = await post('/api/wealth/freedom/goal', {
      kind: 'age',
      age: 70,
      ageRevision: state.ageRevision,
      revision: state.revision,
    });
    expect(failed.status).toBe(409);
    expect(await failed.text()).not.toMatch(/1980|1981|06-15|2050|2051/);
    const latest = await get();
    const saved = await post('/api/wealth/freedom/goal', {
      kind: 'age',
      age: 70,
      ageRevision: latest.ageRevision,
      revision: latest.revision,
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ goalYear: 2051, goalAge: 70 });
    for (const spy of [info, log, warn, error]) expect(spy).not.toHaveBeenCalled();
  });

  it('retains app session/origin gates and rejects goal query URLs, extra fields and unsafe ranges', async () => {
    signedIn = false;
    expect((await app.request('/api/wealth/freedom/goal')).status).toBe(401);
    signedIn = true;
    originAllowed = false;
    expect(
      (await post('/api/wealth/freedom/goal', { kind: 'year', year: 2050, revision: 'none' }))
        .status,
    ).toBe(403);
    originAllowed = true;
    expect((await app.request('/api/wealth/freedom/goal?year=2050')).status).toBe(400);
    for (const body of [
      { kind: 'year', year: 2050.5, revision: 'none' },
      { kind: 'year', year: 2050, revision: 'none', birthDate: '1980-06-15' },
      { kind: 'year', year: 2090, revision: 'none' },
      { kind: 'age', age: 70, revision: 'none' },
    ])
      expect((await post('/api/wealth/freedom/goal', body)).status).toBeGreaterThanOrEqual(400);
    expect((await get()).goalYear).toBeNull();
  });
});
