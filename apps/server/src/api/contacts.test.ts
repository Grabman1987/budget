/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import { accounts, createTestDatabase, type Db } from '@budget/db';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-09-17';
const webDir = mkdtempSync(join(tmpdir(), 'budget-contacts-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
  routes: new Hono(),
};

let db: Db;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = createTestDatabase().db;
  accounts.create(
    db,
    {
      id: 'giro',
      name: 'Giro',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      openingBalanceCents: 100_000,
    },
    { actor: 'tester' },
  );
  app = createApp({ webDir, auth: signedIn, ledger: { db, today: () => TODAY } });
});

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as any };
}

const newContact = async (name = 'Anna Beispiel') =>
  (await call('POST', '/contacts', { name })).body.contact.id as string;

/** An Auslage as the capture form books it: the category is left out, the API creates Auslagen. */
const auslage = (contactId: string, date: string, cents: number) =>
  call('POST', '/bookings', {
    type: 'booking',
    accountId: 'giro',
    date,
    amountCents: -cents,
    memo: 'Kino',
    splits: [{ amountCents: -cents, contactId }],
  });

const netWorth = async () =>
  ((await call('GET', '/accounts')).body.accounts as any[]).reduce(
    (sum, a) => sum + a.balanceCents + a.holdingsCents,
    0,
  ) as number;

describe('contacts API', () => {
  it('creates, lists, renames and deletes contacts', async () => {
    const created = await call('POST', '/contacts', { name: ' Anna  Beispiel', note: 'Reise' });
    expect(created.status).toBe(201);
    expect(created.body.contact).toMatchObject({
      name: 'Anna Beispiel',
      note: 'Reise',
      balanceCents: 0,
      openItemCount: 0,
    });
    const id = created.body.contact.id;
    expect((await call('GET', '/contacts')).body).toMatchObject({
      contacts: [{ id, name: 'Anna Beispiel' }],
      totals: { receivableCents: 0, payableCents: 0, openItemCount: 0 },
    });
    const patched = await call('PATCH', `/contacts/${id}`, { name: 'Anna B.' });
    expect(patched.body.contact.name).toBe('Anna B.');
    expect(patched.body.groupId).toEqual(expect.any(String));
    const gone = await call('DELETE', `/contacts/${id}`);
    expect(gone.status).toBe(200);
    expect((await call('GET', '/contacts')).body.contacts).toEqual([]);
    expect((await call('POST', `/contacts/${id}/restore`)).body.contact.name).toBe('Anna B.');
  });

  it('answers 400 for a bad body and 404 for an unknown contact', async () => {
    expect((await call('POST', '/contacts', { name: '' })).status).toBe(400);
    expect((await call('PATCH', '/contacts/x', {})).status).toBe(400);
    expect((await call('GET', '/contacts/x')).status).toBe(404);
    expect((await call('GET', '/contacts/x/ledger')).status).toBe(404);
    expect(
      (await call('POST', '/contacts/x/settle', { accountId: 'giro', date: TODAY, amountCents: 1 }))
        .status,
    ).toBe(404);
  });

  it('an Auslage booked through capture raises the balance; the Auslagen category appears', async () => {
    const id = await newContact();
    const booked = await auslage(id, '2026-09-02', 4_000);
    expect(booked.status).toBe(201);
    const { contact } = (await call('GET', `/contacts/${id}`)).body;
    expect(contact).toMatchObject({ balanceCents: 4_000, openCents: 4_000, openItemCount: 1 });
    expect((await call('GET', '/contacts')).body.totals).toMatchObject({
      receivableCents: 4_000,
      openItemCount: 1,
    });
    const tree = (await call('GET', '/categories')).body;
    expect(tree.categories.filter((c: any) => c.kind === 'advance')).toHaveLength(1);
  });

  it('does not touch the net worth: paying for a contact lowers it until repaid', async () => {
    const id = await newContact();
    const before = await netWorth();
    await auslage(id, '2026-09-02', 4_000);
    expect(await netWorth()).toBe(before - 4_000);
    await call('POST', `/contacts/${id}/settle`, {
      accountId: 'giro',
      date: TODAY,
      amountCents: 4_000,
    });
    expect(await netWorth()).toBe(before);
  });

  it('serves the Kontoblatt with rows, statements, open items and the outlook', async () => {
    const id = await newContact();
    await auslage(id, '2026-08-03', 4_000);
    await auslage(id, '2026-09-02', 2_550);
    await call('POST', `/contacts/${id}/settle`, {
      accountId: 'giro',
      date: '2026-09-10',
      amountCents: 5_000,
    });
    const { status, body } = await call(
      'GET',
      `/contacts/${id}/ledger?from=2026-09-01&to=2026-09-30`,
    );
    expect(status).toBe(200);
    expect(body.openingCents).toBe(4_000);
    expect(
      body.rows.map((r: any) => [r.date, r.auslageCents, r.ausgleichCents, r.balanceCents]),
    ).toEqual([
      ['2026-09-02', 2_550, 0, 6_550],
      ['2026-09-10', 0, 5_000, 1_550],
    ]);
    expect(body.statements).toEqual([
      {
        month: '2026-09',
        openingCents: 4_000,
        newCents: 2_550,
        paidCents: 5_000,
        differenceCents: -2_450,
        closingCents: 1_550,
      },
    ]);
    expect(body.openItems).toMatchObject([
      { date: '2026-09-02', amountCents: 2_550, openCents: 1_550 },
    ]);
    expect(body.outlook).toMatchObject({ contributions: [], passThroughs: [] });
    expect((await call('GET', `/contacts/${id}/ledger?from=2026-9-1`)).status).toBe(400);
  });

  it('settles FIFO, answers the distribution, and one undo reverts the repayment', async () => {
    const id = await newContact();
    await auslage(id, '2026-08-03', 4_000);
    await auslage(id, '2026-09-01', 2_550);
    const settled = await call('POST', `/contacts/${id}/settle`, {
      accountId: 'giro',
      date: '2026-09-16',
      amountCents: 5_000,
      memo: 'bar',
    });
    expect(settled.status).toBe(201);
    expect(
      settled.body.settlement.parts.map((p: any) => [p.settledCents, p.remainingCents]),
    ).toEqual([
      [4_000, 0],
      [1_000, 1_550],
    ]);
    expect(settled.body.contact).toMatchObject({ balanceCents: 1_550, openItemCount: 1 });
    const booking = (await call('GET', `/bookings/${settled.body.bookingId}`)).body.booking;
    expect(booking).toMatchObject({ amountCents: 5_000, memo: 'bar', accountId: 'giro' });
    expect(booking.splits[0]).toMatchObject({ contactId: id, categoryName: 'Auslagen' });

    const undone = await call('POST', '/undo', { groupId: settled.body.groupId });
    expect(undone.status).toBe(200);
    expect((await call('GET', `/contacts/${id}`)).body.contact).toMatchObject({
      balanceCents: 6_550,
      openItemCount: 2,
    });
  });

  it('refuses a repayment above the open amount, in the future, or without anything open', async () => {
    const id = await newContact();
    const settle = (over: object) =>
      call('POST', `/contacts/${id}/settle`, {
        accountId: 'giro',
        date: TODAY,
        amountCents: 100,
        ...over,
      });
    expect((await settle({})).status).toBe(422);
    await auslage(id, '2026-09-02', 4_000);
    expect((await settle({ amountCents: 4_001 })).status).toBe(422);
    expect((await settle({ date: '2026-09-18' })).status).toBe(422);
    expect((await settle({ amountCents: 0 })).status).toBe(400);
    expect((await settle({ amountCents: 12.5 })).status).toBe(400);
    expect((await settle({ accountId: 'missing' })).status).toBe(404);
    expect((await settle({})).status).toBe(201);
  });

  it('refuses to delete a contact with bookings', async () => {
    const id = await newContact();
    await auslage(id, '2026-09-02', 4_000);
    expect((await call('DELETE', `/contacts/${id}`)).status).toBe(409);
  });

  it('Alle Buchungen can be filtered by contact', async () => {
    const id = await newContact();
    const other = await newContact('Bernd');
    await auslage(id, '2026-09-02', 4_000);
    await auslage(other, '2026-09-03', 900);
    const list = (await call('GET', `/bookings?contactId=${id}`)).body;
    expect(list.items).toHaveLength(1);
    expect(list.items[0].amountCents).toBe(-4_000);
  });
});
