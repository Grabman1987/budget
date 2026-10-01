import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createTestDatabase } from '@budget/db';
import { portfolioRoutes } from './invest';
import { errorResponse } from './http';

const opened = createTestDatabase();
afterAll(() => opened.close());
afterEach(() => {
  opened.sqlite.exec('DELETE FROM investment_preference; DELETE FROM audit_log;');
});

describe('portfolio preferences API', () => {
  const app = portfolioRoutes(opened.db, () => '2026-02-01');
  app.onError(errorResponse);
  const patch = (body: unknown) =>
    app.request('/preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('returns the default, saves either method and rejects unknown or extra fields', async () => {
    expect(await (await app.request('/preferences')).json()).toEqual({ costMethod: 'average' });
    for (const costMethod of ['fifo', 'average']) {
      const res = await patch({ costMethod });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ costMethod, groupId: expect.any(String) });
      expect(await (await app.request('/preferences')).json()).toEqual({ costMethod });
    }
    expect((await patch({ costMethod: 'unknown' })).status).toBe(400);
    expect((await patch({ costMethod: 'fifo', extra: true })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    expect(await (await app.request('/preferences')).json()).toEqual({ costMethod: 'average' });
  });
});
