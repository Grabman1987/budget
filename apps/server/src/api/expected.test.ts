/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import {
  accounts,
  categories,
  createBooking,
  createEntity,
  createTestDatabase,
  schema,
  type Db,
} from '@budget/db';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-03-31';
const webDir = mkdtempSync(join(tmpdir(), 'budget-expected-'));
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
  const ctx = { actor: 'tester' };
  accounts.create(
    db,
    {
      id: 'giro',
      name: 'Giro',
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
    },
    ctx,
  );
  createEntity(db, schema.categoryGroup, { id: 'g', name: 'Fixkosten' }, ctx);
  categories.create(db, { id: 'miete', name: 'Miete', groupId: 'g', class: 'need' }, ctx);
  createEntity(db, schema.payee, { id: 'p1', name: 'Vermieter' }, ctx);
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

const rent = {
  name: 'Miete',
  kind: 'outflow',
  accountId: 'giro',
  payeeId: 'p1',
  categoryId: 'miete',
  rhythm: 'monthly',
  dueDay: 1,
  amountCents: 40_000,
  validFrom: '2026-01-01',
};

describe('POST /expected, GET /expected', () => {
  it('creates a payment with its first version and lists it with the equivalents', async () => {
    const created = await call('POST', '/expected', rent);
    expect(created.status).toBe(201);
    expect(created.body.payment).toMatchObject({ name: 'Miete', dateShift: 'none', dueDay: 1 });
    expect(created.body.version).toMatchObject({ validFrom: '2026-01-01', amountCents: 40_000 });
    expect(created.body.groupId).toBeTruthy();

    const list = await call('GET', '/expected');
    expect(list.body.payments).toHaveLength(1);
    expect(list.body.payments[0]).toMatchObject({
      amountCents: -40_000,
      nextDueDate: '2026-04-01',
      monthlyEquivalentCents: -40_000,
      yearlyEquivalentCents: -480_000,
    });
  });

  it('refuses an invalid body: no amount, bad day, unknown rhythm', async () => {
    const noAmount: Record<string, unknown> = { ...rent };
    delete noAmount['amountCents'];
    expect((await call('POST', '/expected', noAmount)).status).toBe(400);
    expect((await call('POST', '/expected', { ...rent, dueDay: 32 })).status).toBe(400);
    expect((await call('POST', '/expected', { ...rent, rhythm: 'weekly' })).status).toBe(400);
    expect((await call('POST', '/expected', { ...rent, amountCents: 10.5 })).status).toBe(400);
  });

  it('without validFrom the first version starts on the start date, else this month', async () => {
    const a = await call('POST', '/expected', {
      ...rent,
      validFrom: undefined,
      startDate: '2026-02-01',
    });
    expect(a.body.version.validFrom).toBe('2026-02-01');
    const b = await call('POST', '/expected', { ...rent, validFrom: undefined, name: 'Zweite' });
    expect(b.body.version.validFrom).toBe('2026-03-01');
  });
});

describe('PATCH, DELETE, restore, versions', () => {
  it('patches, adds a version, deletes and restores, each undoable', async () => {
    const id = (await call('POST', '/expected', rent)).body.payment.id;

    const patched = await call('PATCH', `/expected/${id}`, { dueDay: 15, dateShift: 'before' });
    expect(patched.body.payment).toMatchObject({ dueDay: 15, dateShift: 'before' });
    expect((await call('PATCH', `/expected/${id}`, {})).status).toBe(400);
    expect((await call('PATCH', '/expected/nope', { dueDay: 2 })).status).toBe(404);

    const v = await call('POST', `/expected/${id}/versions`, {
      validFrom: '2026-06-01',
      amountCents: 42_000,
    });
    expect(v.status).toBe(201);
    expect(
      (await call('POST', `/expected/${id}/versions`, { validFrom: '2026-06-01', amountCents: 1 }))
        .status,
    ).toBe(409);
    const versions = await call('GET', `/expected/${id}/versions`);
    expect(versions.body.versions.map((x: any) => x.amountCents)).toEqual([40_000, 42_000]);

    const occurrences = await call('GET', '/expected/occurrences?from=2026-06-01&to=2026-06-30');
    expect(occurrences.body.occurrences[0]).toMatchObject({
      amountCents: -42_000,
      status: 'expected',
    });

    const undone = await call('POST', '/undo', { groupId: v.body.groupId });
    expect(undone.status).toBe(200);
    expect((await call('GET', `/expected/${id}/versions`)).body.versions).toHaveLength(1);

    const del = await call('DELETE', `/expected/${id}`);
    expect(del.status).toBe(200);
    expect((await call('GET', '/expected')).body.payments).toEqual([]);
    expect((await call('GET', '/expected?deleted=1')).body.payments).toHaveLength(1);
    expect((await call('POST', `/expected/${id}/restore`)).body.payment.id).toBe(id);
    expect((await call('GET', '/expected')).body.payments).toHaveLength(1);
  });
});

describe('occurrences, refresh, link, unlink, missed', () => {
  const book = (date: string, amountCents: number) =>
    createBooking(
      db,
      {
        accountId: 'giro',
        date,
        amountCents,
        payeeId: 'p1',
        splits: [{ categoryId: 'miete', amountCents }],
      },
      { actor: 'tester' },
    );

  it('refresh plans and matches; the list carries status, amounts and the suggestion', async () => {
    await call('POST', '/expected', rent);
    book('2026-03-01', -40_000);
    book('2026-02-01', -43_000);
    const refresh = await call('POST', '/expected/refresh');
    expect(refresh.status).toBe(200);
    expect(refresh.body.match).toMatchObject({ received: 1, deviating: 1 });
    expect((await call('POST', '/expected/refresh')).body).toMatchObject({
      refresh: { created: 0, updated: 0, removed: 0 },
      match: { received: 0, deviating: 0, missed: 0 },
    });

    const list = await call(
      'GET',
      '/expected/occurrences?from=2026-02-01&to=2026-04-30&kind=outflow',
    );
    expect(list.body.occurrences.map((o: any) => [o.dueDate, o.status])).toEqual([
      ['2026-02-01', 'deviating'],
      ['2026-03-01', 'received'],
      ['2026-04-01', 'expected'],
    ]);
    expect(list.body.occurrences[0].suggestion).toMatchObject({
      fromMonth: '2026-02',
      amountCents: 43_000,
    });
    expect(
      (await call('GET', '/expected/occurrences?from=2026-02-01&to=2026-04-30&kind=inflow')).body
        .occurrences,
    ).toEqual([]);
    expect((await call('GET', '/expected/occurrences?from=2026-05-01&to=2026-04-01')).status).toBe(
      400,
    );
    expect((await call('GET', '/expected/occurrences')).status).toBe(400);
  });

  it('links by hand, unlinks, marks ausgefallen', async () => {
    await call('POST', '/expected', rent);
    await call('POST', '/expected/refresh');
    const { occurrences } = (
      await call('GET', '/expected/occurrences?from=2026-04-01&to=2026-04-30')
    ).body;
    const id = occurrences[0].occurrenceId;
    const bookingId = book('2026-04-09', -40_000);

    const link = await call('POST', `/expected/occurrences/${id}/link`, { bookingId });
    expect(link.body.occurrence).toMatchObject({ status: 'received', bookingId });
    expect((await call('POST', `/expected/occurrences/${id}/link`, {})).status).toBe(400);
    expect(
      (await call('POST', `/expected/occurrences/${id}/link`, { bookingId: 'nope' })).status,
    ).toBe(404);
    expect((await call('POST', `/expected/occurrences/${id}/missed`)).status).toBe(409);

    const unlink = await call('POST', `/expected/occurrences/${id}/unlink`);
    expect(unlink.body.occurrence).toMatchObject({ status: 'missed', bookingId: null });
    expect((await call('POST', `/expected/occurrences/${id}/unlink`)).status).toBe(409);

    const may = (await call('GET', '/expected/occurrences?from=2026-05-01&to=2026-05-31')).body
      .occurrences[0];
    const missed = await call('POST', `/expected/occurrences/${may.occurrenceId}/missed`);
    expect(missed.body.occurrence.status).toBe('missed');
    expect((await call('POST', '/expected/occurrences/nope/missed')).status).toBe(404);
  });

  it('income of a month: received against expected', async () => {
    await call('POST', '/expected', {
      ...rent,
      name: 'Gehalt',
      kind: 'inflow',
      categoryId: null,
      dueDay: 31,
      dateShift: 'before',
      amountCents: 300_000,
    });
    createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-03-31',
        amountCents: 300_000,
        payeeId: 'p1',
        splits: [{ categoryId: null, amountCents: 300_000 }],
      },
      { actor: 'tester' },
    );
    await call('POST', '/expected/refresh');
    const income = await call('GET', '/expected/income?month=2026-03');
    expect(income.body).toMatchObject({
      month: '2026-03',
      expectedCents: 300_000,
      receivedCents: 300_000,
    });
    expect(income.body.byPayment[0]).toMatchObject({
      name: 'Gehalt',
      dueDate: '2026-03-31',
      status: 'received',
    });
    expect((await call('GET', '/expected/income?month=2026-13')).status).toBe(400);
  });
});
