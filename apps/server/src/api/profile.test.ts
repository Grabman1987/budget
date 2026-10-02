import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createTestDatabase } from '@budget/db';
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
