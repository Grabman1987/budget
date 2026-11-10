/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect JSON boundary answers. */
import { createTestDatabase, sqliteOf, type OpenedDatabase } from '@budget/db';
import { Hono } from 'hono';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createLedgerApi } from './index';
import { seedIdentityContacts } from '../../../../packages/db/src/repos/contact-identity-fixture';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';

let opened: OpenedDatabase;
let app: Hono;
let signedIn = true;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  seedIdentityContacts(opened.db);
  signedIn = true;
  const api = createLedgerApi({
    db: opened.db,
    today: () => '2026-09-17',
    stepUp: async (_c, next) => next(),
  });
  app = new Hono();
  app.use('*', async (c, next) => (signedIn ? next() : c.json({ error: 'unauthorized' }, 401)));
  app.route('/', api);
});
afterEach(() => opened.close());

async function call(method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json().catch(() => null)) as any };
}
const q = (sql: string) => sqliteOf(opened.db).prepare(sql).all();
const facts = () => ({
  bookings: q('SELECT id, date, amount_cents, status FROM booking ORDER BY id'),
  splits: q('SELECT id, booking_id, contact_id, amount_cents FROM booking_split ORDER BY id'),
  settlements: q('SELECT id, contact_id, credit_cents FROM contact_settlement ORDER BY id'),
});
const groups = () => (q('SELECT count(DISTINCT group_id) AS n FROM audit_log')[0] as { n: number }).n;

it('requires a session, previews read-only, commits with the token and undoes as one group', async () => {
  signedIn = false;
  expect((await call('POST', '/contacts/kb/merge/preview', { targetId: 'ka' })).status).toBe(401);
  signedIn = true;
  const before = facts();
  const g0 = groups();

  const preview = await call('POST', '/contacts/kb/merge/preview', { targetId: 'ka' });
  expect(preview.status).toBe(200);
  expect(preview.body).toMatchObject({
    conflicts: [],
    after: { receivableCents: 4500, creditCents: 0 },
    newAlias: 'Kontakt B',
  });
  expect(groups()).toBe(g0);

  // No token, wrong token: refused without a write.
  expect((await call('POST', '/contacts/kb/merge', { targetId: 'ka' })).status).toBe(400);
  const forged = await call('POST', '/contacts/kb/merge', { targetId: 'ka', token: '1.abc' });
  expect(forged.status).toBe(409);
  expect(forged.body.error).toBe('stale_preview');
  expect(groups()).toBe(g0);

  const commit = await call('POST', '/contacts/kb/merge', {
    targetId: 'ka',
    token: preview.body.token,
  });
  expect(commit.status).toBe(200);
  expect(groups()).toBe(g0 + 1);
  expect(facts()).toEqual(before);
  const statement = await call('GET', '/contacts/kb');
  expect(statement.body.contact.id).toBe('ka');
  expect(statement.body.resolvedFromId).toBe('kb');

  // The merged source cannot be reopened, merged again, or used as target.
  expect((await call('POST', '/contacts/kb/reopen', {})).status).toBe(409);
  const again = await call('POST', '/contacts/kb/merge/preview', { targetId: 'ka' });
  expect(again.body.conflicts).toContain('source_merged');

  const undone = await call('POST', '/undo', { groupId: commit.body.groupId });
  expect(undone.status).toBe(200);
  expect(q("SELECT merged_into_id, archived_at FROM contact WHERE id = 'kb'")).toEqual([
    { merged_into_id: null, archived_at: null },
  ]);
  expect(facts()).toEqual(before);
});

it('answers conflicts as 409 with machine-readable reasons and writes nothing', async () => {
  const same = await call('POST', '/contacts/ka/merge/preview', { targetId: 'ka' });
  expect(same.status).toBe(200);
  expect(same.body.conflicts).toEqual(['same_contact']);
  expect(same.body.token).toBeNull();
  const g0 = groups();
  const refused = await call('POST', '/contacts/ka/merge', { targetId: 'ka', token: 'x.y' });
  expect(refused.status).toBe(409);
  expect(refused.body).toMatchObject({ error: 'merge_conflict', reasons: ['same_contact'] });
  expect((await call('POST', '/contacts/missing/merge/preview', { targetId: 'ka' })).status).toBe(404);
  expect(groups()).toBe(g0);
});
