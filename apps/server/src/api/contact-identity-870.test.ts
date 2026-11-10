/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect JSON boundary answers. */
import {
  createTestDatabase,
  listContactStatements,
  sqliteOf,
  type OpenedDatabase,
} from '@budget/db';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
/** Everything the identity operations must not touch (independent of the production calculation). */
const facts = () => ({
  bookings: q('SELECT id, date, amount_cents, status FROM booking ORDER BY id'),
  splits: q('SELECT id, booking_id, contact_id, amount_cents FROM booking_split ORDER BY id'),
  settlements: q('SELECT id, contact_id, credit_cents FROM contact_settlement ORDER BY id'),
  allocations: q(
    'SELECT id, settlement_id, outlay_split_id, amount_cents FROM contact_allocation ORDER BY id',
  ),
  contacts: q('SELECT id FROM contact ORDER BY id'),
  statements: listContactStatements(opened.db, '2026-09-17', true).map((c) => [
    c.id,
    c.receivableCents,
    c.creditCents,
  ]),
});
const auditGroups = () =>
  (q('SELECT count(DISTINCT group_id) AS n FROM audit_log')[0] as { n: number }).n;
const stamp = async (id: string) =>
  (await call('GET', '/lookups')).body.contacts.find((c: any) => c.id === id).updatedAt as string;

describe('contact aliases API', () => {
  it('adds (201) and removes an alias with Undo, leaving every booking fact untouched', async () => {
    const before = facts();
    const added = await call('POST', '/contacts/ka/aliases', { alias: '  Kontakt   A (alt) ' });
    expect(added.status).toBe(201);
    expect(added.body.alias).toMatchObject({ contactId: 'ka', alias: 'Kontakt A (alt)' });
    expect(facts()).toEqual(before);
    const lookups = (await call('GET', '/lookups')).body.contacts.find((c: any) => c.id === 'ka');
    expect(lookups.aliases).toEqual([
      expect.objectContaining({ id: added.body.alias.id, alias: 'Kontakt A (alt)' }),
    ]);
    const undone = await call('POST', '/undo', { groupId: added.body.groupId });
    expect(undone.status).toBe(200);
    expect(
      (await call('GET', '/lookups')).body.contacts.find((c: any) => c.id === 'ka').aliases,
    ).toEqual([]);
    const again = await call('POST', '/contacts/ka/aliases', { alias: 'Kontakt A (alt)' });
    const removed = await call('DELETE', `/contacts/ka/aliases/${again.body.alias.id}`);
    expect(removed.status).toBe(200);
    expect((await call('POST', '/undo', { groupId: removed.body.groupId })).status).toBe(200);
    expect(
      (await call('GET', '/contacts/ka')).body.contact.aliases.map((a: any) => a.alias),
    ).toEqual(['Kontakt A (alt)']);
    expect(facts()).toEqual(before);
  });

  it('409 label_taken names the owner; 422 own name; 400 invalid; no audit group written', async () => {
    await call('POST', '/contacts/ka/aliases', { alias: 'Herr A' });
    const groups = auditGroups();
    const taken = await call('POST', '/contacts/kb/aliases', { alias: ' herr   a ' });
    expect(taken.status).toBe(409);
    expect(taken.body).toMatchObject({ error: 'label_taken', ownerContactId: 'ka', kind: 'alias' });
    const name = await call('POST', '/contacts/ka/aliases', { alias: 'kontakt b' });
    expect(name.body).toMatchObject({ error: 'label_taken', ownerContactId: 'kb', kind: 'name' });
    expect((await call('POST', '/contacts/ka/aliases', { alias: 'KONTAKT  A' })).status).toBe(422);
    for (const bad of [{ alias: '   ' }, { alias: 'x'.repeat(201) }, {}, { alias: 'ok', extra: 1 }])
      expect((await call('POST', '/contacts/ka/aliases', bad)).status).toBe(400);
    expect((await call('POST', '/contacts/nope/aliases', { alias: 'Neu' })).status).toBe(404);
    expect((await call('PATCH', '/contacts/kb', { name: 'HERR A' })).status).toBe(409);
    expect(auditGroups()).toBe(groups);
  });

  it('409 stale with the current row when expectedUpdatedAt is old', async () => {
    const stale = await call('POST', '/contacts/ka/aliases', {
      alias: 'Neu',
      expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
    });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: 'stale', current: { id: 'ka' } });
    const fresh = await call('POST', '/contacts/ka/aliases', {
      alias: 'Neu',
      expectedUpdatedAt: await stamp('ka'),
    });
    expect(fresh.status).toBe(201);
    const old = await call(
      'DELETE',
      `/contacts/ka/aliases/${fresh.body.alias.id}?expectedUpdatedAt=2020-01-01`,
    );
    expect(old.status).toBe(409);
    expect(old.body.error).toBe('stale');
    const rename = await call('PATCH', '/contacts/ka', {
      name: 'Kontakt A neu',
      expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
    });
    expect(rename.status).toBe(409);
    expect(rename.body.error).toBe('stale');
  });

  it('refuses Undo of an add once the alias was removed', async () => {
    const added = await call('POST', '/contacts/ka/aliases', { alias: 'Alias Drei' });
    await call('DELETE', `/contacts/ka/aliases/${added.body.alias.id}`);
    const undone = await call('POST', '/undo', { groupId: added.body.groupId });
    expect(undone.status).toBe(409);
    expect(undone.body.error).toBe('undo_refused');
  });

  it('requires a session', async () => {
    signedIn = false;
    expect((await call('POST', '/contacts/ka/aliases', { alias: 'X' })).status).toBe(401);
    expect((await call('DELETE', '/contacts/ka/aliases/x')).status).toBe(401);
    expect((await call('POST', '/contacts/kb/archive', {})).status).toBe(401);
    expect((await call('POST', '/contacts/kb/reopen', {})).status).toBe(401);
  });
});

describe('contact archive API', () => {
  it('409 contact_blocked lists the blockers for Kontakt A and writes nothing', async () => {
    const before = facts();
    const groups = auditGroups();
    const refused = await call('POST', '/contacts/ka/archive', {});
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({
      error: 'contact_blocked',
      blockers: [{ kind: 'receivable', count: 4500 }],
    });
    expect(auditGroups()).toBe(groups);
    expect(facts()).toEqual(before);
  });

  it('each other blocker answers 409: credit, expected payment, payee', async () => {
    expect((await call('POST', '/contacts', { name: 'Kontakt C' })).status).toBe(201);
    const kc = q("SELECT id FROM contact WHERE name = 'Kontakt C'")[0] as { id: string };
    expect(
      (
        await call('POST', `/contacts/${kc.id}/settlements`, {
          accountId: 'giro',
          date: '2026-03-12',
          amountCents: 500,
        })
      ).status,
    ).toBe(201);
    expect((await call('POST', `/contacts/${kc.id}/archive`, {})).body.blockers).toEqual([
      { kind: 'credit', count: 500 },
    ]);
    expect((await call('POST', '/contacts', { name: 'Kontakt D' })).status).toBe(201);
    const kd = q("SELECT id FROM contact WHERE name = 'Kontakt D'")[0] as { id: string };
    expect((await call('POST', '/payees', { name: 'Zahler D', contactId: kd.id })).status).toBe(
      201,
    );
    expect((await call('POST', `/contacts/${kd.id}/archive`, {})).body.blockers).toEqual([
      { kind: 'payee', count: 1 },
    ]);
  });

  it('archives and reopens Kontakt B, hidden from pick lists, kept in history; Undo restores', async () => {
    const before = facts();
    const archived = await call('POST', '/contacts/kb/archive', {
      expectedUpdatedAt: await stamp('kb'),
    });
    expect(archived.status).toBe(200);
    expect(archived.body.contact.archivedAt).toEqual(expect.any(String));
    expect(facts()).toEqual(before);
    const entry = (await call('GET', '/lookups')).body.contacts.find((c: any) => c.id === 'kb');
    expect(entry).toMatchObject({ archived: true });
    expect((await call('GET', '/contacts?history=1')).body.contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'kb', archivedAt: expect.any(String) }),
      ]),
    );
    expect((await call('GET', '/contacts/kb')).status).toBe(200);
    expect((await call('POST', '/undo', { groupId: archived.body.groupId })).status).toBe(200);
    expect((await call('GET', '/contacts/kb')).body.contact.archivedAt).toBeNull();
    const again = await call('POST', '/contacts/kb/archive', {});
    const reopened = await call('POST', '/contacts/kb/reopen', {});
    expect(reopened.status).toBe(200);
    expect(reopened.body.contact.archivedAt).toBeNull();
    expect(again.status).toBe(200);
    expect(facts()).toEqual(before);
  });

  it('writers given an archived contact answer 409 contact_archived', async () => {
    await call('POST', '/contacts/kb/archive', {});
    const groups = auditGroups();
    expect(
      (await call('POST', '/payees', { name: 'Zahler B', contactId: 'kb' })).body,
    ).toMatchObject({ error: 'contact_archived', contactId: 'kb' });
    const booking = await call('POST', '/bookings', {
      type: 'booking',
      accountId: 'giro',
      date: '2026-09-01',
      amountCents: -100,
      splits: [{ categoryId: 'auslagen', contactId: 'kb', amountCents: -100 }],
    });
    expect(booking.status).toBe(409);
    expect(booking.body.error).toBe('contact_archived');
    expect(auditGroups()).toBe(groups);
  });

  it('refuses Undo of an archive after a later edit and rejects bad input', async () => {
    const archived = await call('POST', '/contacts/kb/archive', {});
    await call('POST', '/contacts/kb/aliases', { alias: 'Nach Archiv' });
    // The alias does not change the contact row, so Undo still applies; a rename does.
    await call('PATCH', '/contacts/kb', { name: 'Kontakt B neu' });
    const refused = await call('POST', '/undo', { groupId: archived.body.groupId });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('undo_refused');
    expect((await call('POST', '/contacts/kb/archive', { x: 1 })).status).toBe(400);
    expect((await call('POST', '/contacts/none/archive', {})).status).toBe(404);
  });
});
