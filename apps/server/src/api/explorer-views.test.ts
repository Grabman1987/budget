import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase } from '@budget/db';
import type { ExplorerViewsState, ExplorerViewsWrite } from '@budget/domain';
import { Hono } from 'hono';
import { explorerViewsRoutes } from './explorer-views';
import { undoRoutes } from './lookups';
import { errorResponse } from './http';

const opened = createTestDatabase();
afterAll(() => opened.close());
beforeEach(() => opened.sqlite.exec('DELETE FROM app_setting; DELETE FROM audit_log;'));
const app = new Hono();
app.onError(errorResponse);
app.route('/views', explorerViewsRoutes(opened.db));
app.route('/undo', undoRoutes(opened.db));
const query = { dim: 'kategorie', cls: 'want', cols: 'quartal', period: '3J', meas: 'summe' };
const post = (path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('bounded saved Explorer query API', () => {
  it('exposes the same versioned state to separate clients and preserves grouped undo', async () => {
    const initial = (await (await app.request('/views')).json()) as ExplorerViewsState;
    expect(initial).toEqual({ schemaVersion: 1, revision: 'none', views: [], unavailable: false });
    const saved = (await (
      await post('/views', {
        kind: 'save',
        revision: initial.revision,
        view: { name: 'Muster', query },
      })
    ).json()) as ExplorerViewsWrite;
    const secondClient = (await (await app.request('/views')).json()) as ExplorerViewsState;
    expect(secondClient.views).toEqual(saved.views);
    const conflict = await post('/views', {
      kind: 'delete',
      id: saved.views[0]!.id,
      revision: initial.revision,
    });
    expect(conflict.status).toBe(409);
    expect(await (await app.request('/views')).json()).toEqual(secondClient);
    expect((await post('/undo', { groupId: saved.groupId })).status).toBe(200);
    const undone = (await (await app.request('/views')).json()) as ExplorerViewsState;
    expect(undone.views).toEqual([]);
    expect(undone.revision).not.toBe(initial.revision);
  });
  it('rejects unsupported scope, result rows, schema fields, malformed ranges and long names', async () => {
    for (const view of [
      { name: 'Muster', query: { ...query, accountId: 'other' } },
      { name: 'Muster', query, rows: [{ total: 1234 }] },
      { name: 'Muster', query: { ...query, period: '2026-13..2026-14' } },
      { name: 'a'.repeat(41), query },
    ])
      expect((await post('/views', { kind: 'save', revision: 'none', view })).status).toBe(400);
    expect(
      (
        await post('/views', {
          kind: 'save',
          revision: 'none',
          schemaVersion: 2,
          view: { name: 'Muster', query },
        })
      ).status,
    ).toBe(400);
    expect(((await (await app.request('/views')).json()) as ExplorerViewsState).views).toEqual([]);
    expect((await app.request('/views?report=other')).status).toBe(400);
    expect((await app.request('/views?accountId=other')).status).toBe(400);
  });
});
