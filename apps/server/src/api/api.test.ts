/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import { categories, createEntity, createTestDatabase, schema, type Db } from '@budget/db';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-03-31';
const webDir = mkdtempSync(join(tmpdir(), 'budget-api-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');

/** The session guard has its own tests (auth.test.ts); here every request is signed in. */
const signedIn: AuthGate = {
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  routes: new Hono(),
};

let db: Db;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = createTestDatabase().db;
  const ctx = { actor: 'tester' };
  createEntity(db, schema.categoryGroup, { id: 'g', name: 'Fixkosten' }, ctx);
  for (const [id, name] of [
    ['essen', 'Essen'],
    ['miete', 'Miete'],
  ] as const) {
    categories.create(db, { id, name, groupId: 'g', class: 'need' }, ctx);
  }
  categories.create(
    db,
    { id: 'auslagen', name: 'Auslagen', groupId: 'g', class: null, kind: 'advance' },
    ctx,
  );
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
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const newAccount = async (over: Record<string, unknown> = {}) => {
  const res = await call('POST', '/accounts', {
    name: 'Giro',
    type: 'checking',
    openingDate: '2026-01-01',
    openingBalanceCents: 100_000,
    ...over,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body['account'] as { id: string };
};
const newBooking = async (accountId: string, over: Record<string, unknown> = {}) => {
  const res = await call('POST', '/bookings', {
    type: 'booking',
    accountId,
    date: '2026-03-10',
    amountCents: -1000,
    categoryId: 'essen',
    ...over,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; groupId: string; bookings: Array<Record<string, any>> };
};

describe('accounts', () => {
  it('creates with role and budget membership from the type, and lists balances', async () => {
    const giro = await newAccount();
    const loan = await newAccount({ name: 'Kredit', type: 'loan', openingBalanceCents: -500_000 });
    const list = (await call('GET', '/accounts')).body;
    expect(list['asOf']).toBe(TODAY);
    const byId = Object.fromEntries(
      (list['accounts'] as Array<Record<string, any>>).map((a) => [a['id'], a]),
    );
    expect(byId[giro.id]).toMatchObject({
      role: 'budget',
      onBudget: true,
      balanceCents: 100_000,
      clearedCents: 100_000,
      unclearedCents: 0,
      sortOrder: 1,
    });
    expect(byId[loan.id]).toMatchObject({ role: 'debt', onBudget: false, sortOrder: 2 });
  });

  it('refuses a loan as budget account and bad input with readable errors', async () => {
    const tracked = await call('POST', '/accounts', {
      name: 'K',
      type: 'loan',
      onBudget: true,
      openingDate: '2026-01-01',
    });
    expect(tracked.status).toBe(422);
    const bad = await call('POST', '/accounts', {
      name: '',
      type: 'nope',
      openingDate: '2026-02-30',
    });
    expect(bad.status).toBe(400);
    expect(bad.body['issues'].map((i: { path: string }) => i.path).sort()).toEqual([
      'name',
      'openingDate',
      'type',
    ]);
    const floats = await call('POST', '/accounts', {
      name: 'F',
      type: 'cash',
      openingDate: '2026-01-01',
      openingBalanceCents: 10.5,
    });
    expect(floats.status).toBe(400);
  });

  it('edits terms and sorts', async () => {
    const a = await newAccount();
    const b = await newAccount({ name: 'Spar', type: 'savings' });
    const patched = await call('PATCH', `/accounts/${a.id}`, {
      name: 'Girokonto',
      overdraftLimitCents: 200_000,
      interestRateBp: 950,
      termEnd: '2030-12-31',
    });
    expect(patched.body['account']).toMatchObject({
      name: 'Girokonto',
      overdraftLimitCents: 200_000,
      interestRateBp: 950,
    });
    const sorted = await call('POST', '/accounts/sort', { ids: [b.id, a.id] });
    expect((sorted.body['accounts'] as Array<{ id: string }>).map((x) => x.id)).toEqual([
      b.id,
      a.id,
    ]);
    // One transaction: an unknown id leaves the order as it was.
    expect((await call('POST', '/accounts/sort', { ids: [a.id, 'none'] })).status).toBe(404);
    expect(
      ((await call('GET', '/accounts')).body['accounts'] as Array<{ id: string }>).map((x) => x.id),
    ).toEqual([b.id, a.id]);
    expect((await call('PATCH', `/accounts/${a.id}`, { type: 'brokerage' })).status).toBe(422);
    expect((await call('PATCH', '/accounts/none', { name: 'x' })).status).toBe(404);
  });

  it('closes only an empty account, unless forced, reopens, and refuses bookings on a closed one', async () => {
    const a = await newAccount();
    expect((await call('POST', `/accounts/${a.id}/close`, {})).body['error']).toBe(
      'account_not_empty',
    );
    const closed = await call('POST', `/accounts/${a.id}/close`, { force: true });
    expect(closed.body['account'].closedAt).not.toBeNull();
    const blocked = await call('POST', '/bookings', {
      type: 'booking',
      accountId: a.id,
      date: '2026-03-01',
      amountCents: -100,
    });
    expect(blocked).toMatchObject({ status: 409, body: { error: 'account_closed' } });
    expect((await call('POST', `/accounts/${a.id}/reopen`)).body['account'].closedAt).toBeNull();
    expect((await call('POST', `/accounts/${a.id}/reopen`)).status).toBe(409);
  });

  it('keeps the currency once there are bookings, and undoes an edit by group', async () => {
    const a = await newAccount();
    await newBooking(a.id);
    expect((await call('PATCH', `/accounts/${a.id}`, { currency: 'USD' })).status).toBe(409);
    const renamed = await call('PATCH', `/accounts/${a.id}`, { name: 'Neu' });
    await call('POST', '/undo', { groupId: renamed.body['groupId'] });
    expect((await call('GET', `/accounts/${a.id}`)).body['account'].name).toBe('Giro');
  });

  it('locks opening balance and date once a check is stored, unless unlocked', async () => {
    const a = await newAccount();
    await call('POST', `/accounts/${a.id}/reconciliation`, {
      date: '2026-02-01',
      statementBalanceCents: 100_000,
    });
    for (const patch of [{ openingBalanceCents: 90_000 }, { openingDate: '2025-12-01' }]) {
      const refused = await call('PATCH', `/accounts/${a.id}`, patch);
      expect(refused).toMatchObject({ status: 409, body: { error: 'reconciled_locked' } });
      expect(refused.body['reconciliationIds']).toHaveLength(1);
    }
    // Unchanged values and other fields stay free.
    expect(
      (await call('PATCH', `/accounts/${a.id}`, { name: 'Neu', openingBalanceCents: 100_000 }))
        .status,
    ).toBe(200);
    const unlocked = await call('PATCH', `/accounts/${a.id}`, {
      openingBalanceCents: 90_000,
      unlockReconciled: true,
    });
    expect(unlocked.status).toBe(200);
    expect(unlocked.body['account']).toMatchObject({ openingBalanceCents: 90_000 });
  });

  it('serves the balance line', async () => {
    const a = await newAccount();
    await newBooking(a.id, { date: '2026-03-02', amountCents: -2500 });
    const res = await call('GET', `/accounts/${a.id}/series?from=2026-03-01&to=2026-03-03`);
    expect(res.body['points'].map((p: { balanceCents: number }) => p.balanceCents)).toEqual([
      100_000, 97_500, 97_500,
    ]);
    expect(
      (await call('GET', `/accounts/${a.id}/series?from=2026-03-05&to=2026-03-01`)).status,
    ).toBe(400);
  });
});

describe('bookings', () => {
  it('creates, edits, deletes and undoes, each as one group', async () => {
    const a = await newAccount();
    const created = await newBooking(a.id, { payeeId: 'p1', memo: 'Miete' });
    expect(created.bookings[0]).toMatchObject({
      amountCents: -1000,
      payeeName: 'Vermieter',
      status: 'confirmed',
    });
    expect(created.bookings[0]?.['splits']).toEqual([
      expect.objectContaining({ categoryId: 'essen', categoryName: 'Essen' }),
    ]);

    const edited = await call('PATCH', `/bookings/${created.id}`, {
      amountCents: -1500,
      flag: 'red',
    });
    expect(edited.body['bookings'][0]).toMatchObject({ amountCents: -1500, flag: 'red' });
    await call('POST', '/undo', { groupId: edited.body['groupId'] });
    expect((await call('GET', `/bookings/${created.id}`)).body['booking']).toMatchObject({
      amountCents: -1000,
      flag: null,
    });

    const removed = await call('DELETE', `/bookings/${created.id}`);
    expect((await call('GET', `/bookings/${created.id}`)).status).toBe(404);
    const undone = await call('POST', '/undo', { groupId: removed.body['groupId'] });
    expect(undone.body['undone']).toBeGreaterThan(0);
    expect((await call('GET', `/bookings/${created.id}`)).status).toBe(200);
    // redo: undo the undo
    await call('POST', '/undo', { groupId: undone.body['groupId'] });
    expect((await call('GET', `/bookings/${created.id}`)).status).toBe(404);
    expect((await call('POST', '/undo', { groupId: 'unknown' })).status).toBe(404);
  });

  it('checks that the splits add up and takes several splits', async () => {
    const a = await newAccount();
    const bad = await call('POST', '/bookings', {
      type: 'booking',
      accountId: a.id,
      date: '2026-03-10',
      amountCents: -1000,
      splits: [
        { categoryId: 'essen', amountCents: -600 },
        { categoryId: 'miete', amountCents: -300 },
      ],
    });
    expect(bad).toMatchObject({ status: 422, body: { error: 'invariant' } });
    const good = await newBooking(a.id, {
      categoryId: undefined,
      splits: [
        { categoryId: 'essen', amountCents: -600 },
        { categoryId: 'miete', amountCents: -400 },
      ],
    });
    expect(good.bookings[0]?.['splits']).toHaveLength(2);
    expect(
      (
        await call('POST', '/bookings', {
          type: 'booking',
          accountId: a.id,
          date: '2026-03-10',
          amountCents: -1,
          categoryId: 'nope',
        })
      ).status,
    ).toBe(422);
  });

  it('books a transfer as exactly two legs and moves both when deleted', async () => {
    const a = await newAccount();
    const b = await newAccount({ name: 'Spar', type: 'savings', openingBalanceCents: 0 });
    const res = await call('POST', '/bookings', {
      type: 'transfer',
      fromAccountId: a.id,
      toAccountId: b.id,
      date: '2026-03-10',
      amountCents: 5000,
    });
    expect(res.status).toBe(201);
    const legs = res.body['bookings'] as Array<Record<string, any>>;
    expect(legs.map((l) => l['amountCents']).sort((x, y) => x - y)).toEqual([-5000, 5000]);
    expect(legs.find((l) => l['accountId'] === a.id)).toMatchObject({
      transferAccountId: b.id,
      transferAccountName: 'Spar',
    });
    expect(
      (
        await call('POST', '/bookings', {
          type: 'transfer',
          fromAccountId: a.id,
          toAccountId: a.id,
          date: '2026-03-10',
          amountCents: 1,
        })
      ).status,
    ).toBe(422);
    // A move between currencies would reinterpret the cents: refused, the currency stays.
    const usd = await newAccount({ name: 'Dollar', currency: 'USD' });
    const plain = await newBooking(a.id);
    const moved = await call('PATCH', `/bookings/${plain.id}`, { accountId: usd.id });
    expect(moved).toMatchObject({ status: 422, body: { error: 'invariant' } });
    expect((await call('GET', `/bookings/${plain.id}`)).body['booking']).toMatchObject({
      accountId: a.id,
      currency: 'EUR',
    });
    await call('DELETE', `/bookings/${plain.id}`);
    await call('DELETE', `/bookings/${res.body['fromBookingId']}`);
    const summary = (await call('GET', '/accounts')).body['accounts'] as Array<Record<string, any>>;
    expect(summary.map((s) => s['balanceCents'])).toEqual([100_000, 0, 100_000]);
  });

  it('lists with filters, sums and cursor pagination', async () => {
    const a = await newAccount();
    for (let i = 1; i <= 5; i++) {
      await newBooking(a.id, {
        date: `2026-03-0${i}`,
        amountCents: -100 * i,
        memo: i % 2 ? 'ungerade' : 'gerade',
      });
    }
    const first = (await call('GET', `/bookings?accountId=${a.id}&limit=2`)).body;
    expect(first['items'].map((i: { date: string }) => i.date)).toEqual([
      '2026-03-05',
      '2026-03-04',
    ]);
    expect(first).toMatchObject({ total: 5, sumCents: -1500 });
    expect(first['items'][0].balanceAfterCents).toBe(100_000 - 1500);
    const second = (
      await call('GET', `/bookings?accountId=${a.id}&limit=2&cursor=${first['nextCursor']}`)
    ).body;
    expect(second['items'].map((i: { date: string }) => i.date)).toEqual([
      '2026-03-03',
      '2026-03-02',
    ]);
    const search = (await call('GET', '/bookings?q=ungerade')).body;
    expect(search['total']).toBe(3);
    expect(
      (await call('GET', '/bookings?sort=amount&direction=asc&limit=1')).body['items'][0]
        .amountCents,
    ).toBe(-500);
    expect((await call('GET', '/bookings?status=nope')).status).toBe(400);
    expect((await call('GET', '/bookings?cursor=%25')).status).toBe(400);
  });

  it('locks reconciled bookings until they are unlocked explicitly', async () => {
    const a = await newAccount();
    const b = await newBooking(a.id);
    await call('POST', `/accounts/${a.id}/reconciliation`, {
      date: TODAY,
      statementBalanceCents: 99_000,
    });
    const locked = await call('PATCH', `/bookings/${b.id}`, { amountCents: -2000 });
    expect(locked).toMatchObject({
      status: 409,
      body: { error: 'reconciled_locked', bookingIds: [b.id] },
    });
    expect((await call('DELETE', `/bookings/${b.id}`)).status).toBe(409);
    expect((await call('PATCH', `/bookings/${b.id}`, { flag: 'green', memo: 'ok' })).status).toBe(
      200,
    );
    expect((await call('PATCH', `/bookings/${b.id}`, { status: 'reconciled' })).status).toBe(400);
    const open = await call('PATCH', `/bookings/${b.id}`, {
      amountCents: -2000,
      unlockReconciled: true,
    });
    expect(open.status).toBe(200);
    expect((await call('DELETE', `/bookings/${b.id}?unlock=1`)).status).toBe(200);
  });

  it('bulk-edits in one undoable group and reports what it skipped', async () => {
    const a = await newAccount();
    const single = await newBooking(a.id, { categoryId: null });
    const split = await newBooking(a.id, {
      categoryId: undefined,
      splits: [
        { categoryId: 'essen', amountCents: -600 },
        { categoryId: 'miete', amountCents: -400 },
      ],
    });
    const done = await newBooking(a.id);
    await call('POST', `/accounts/${a.id}/reconciliation`, {
      date: '2026-03-01',
      statementBalanceCents: 100_000,
    });
    const result = await call('POST', '/bookings/bulk', {
      action: 'update',
      ids: [single.id, split.id, done.id, 'ghost'],
      set: { categoryId: 'miete', flag: 'blue' },
    });
    expect(result.body['changed']).toEqual([single.id, done.id]);
    expect(result.body['skipped']).toEqual([
      { id: split.id, reason: 'split', message: expect.stringContaining('single-split') },
      { id: 'ghost', reason: 'not_found', message: expect.any(String) },
    ]);
    const state = async () => {
      const items = (await call('GET', `/bookings?ids=${single.id},${done.id}`)).body['items'];
      const by = Object.fromEntries(
        items.map((i: any) => [i.id, [i.splits[0].categoryId, i.flag]]),
      );
      return [by[single.id], by[done.id]];
    };
    expect(await state()).toEqual([
      ['miete', 'blue'],
      ['miete', 'blue'],
    ]);
    await call('POST', '/undo', { groupId: result.body['groupId'] });
    expect(await state()).toEqual([
      [null, null],
      ['essen', null],
    ]);
    const removed = await call('POST', '/bookings/bulk', {
      action: 'delete',
      ids: [single.id, split.id],
    });
    expect(removed.body['changed']).toHaveLength(2);
    expect((await call('GET', '/bookings')).body['total']).toBe(1);
    expect(
      (await call('POST', '/bookings/bulk', { action: 'update', ids: [], set: { flag: 'red' } }))
        .status,
    ).toBe(400);
  });

  it('treats both selected legs of a transfer as one Umbuchung', async () => {
    const a = await newAccount();
    const b = await newAccount({ name: 'Spar', type: 'savings', openingBalanceCents: 0 });
    const t = (
      await call('POST', '/bookings', {
        type: 'transfer',
        fromAccountId: a.id,
        toAccountId: b.id,
        date: '2026-03-10',
        amountCents: 5000,
      })
    ).body;
    const legs = [t['fromBookingId'], t['toBookingId']];
    const one = await call('POST', '/bookings/bulk', {
      action: 'update',
      ids: [legs[0]],
      set: { categoryId: 'essen' },
    });
    expect(one.body).toMatchObject({ transferPairs: 0, skipped: [{ reason: 'transfer' }] });
    const both = await call('POST', '/bookings/bulk', {
      action: 'update',
      ids: legs,
      set: { categoryId: 'essen' },
    });
    expect(both.body['transferPairs']).toBe(1);
    expect(both.body['skipped'].map((x: any) => x.reason)).toEqual([
      'transfer_pair',
      'transfer_pair',
    ]);
    const removed = await call('POST', '/bookings/bulk', { action: 'delete', ids: legs });
    expect(removed.body).toMatchObject({ changed: legs, skipped: [], transferPairs: 1 });
    expect((await call('GET', '/bookings')).body['total']).toBe(0);
  });
});

describe('payees', () => {
  it('creates, renames and merges, undoable', async () => {
    const created = await call('POST', '/payees', { name: 'Bäckerei' });
    expect(created.status).toBe(201);
    expect((await call('POST', '/payees', { name: 'bäckerei' })).status).toBe(409);
    const id = created.body['payee'].id;
    expect(
      (await call('PATCH', `/payees/${id}`, { name: 'Bäcker Huber' })).body['payee'].name,
    ).toBe('Bäcker Huber');
    const a = await newAccount();
    await newBooking(a.id, { payeeId: id });
    const merged = await call('POST', '/payees/merge', { sourceIds: [id], targetId: 'p1' });
    expect(merged.body['moved']).toBe(1);
    const names = (await call('GET', '/payees')).body['payees'] as Array<{
      id: string;
      bookingCount: number;
    }>;
    expect(names.find((p) => p.id === 'p1')?.bookingCount).toBe(1);
    expect(names.some((p) => p.id === id)).toBe(false);
    await call('POST', '/undo', { groupId: merged.body['groupId'] });
    // A reconciled booking keeps its payee unless the merge is unlocked.
    const locked = await newBooking(a.id, { payeeId: id, date: '2026-01-10' });
    await call('POST', `/accounts/${a.id}/reconciliation`, {
      date: '2026-01-31',
      statementBalanceCents: 99_000,
    });
    const partial = await call('POST', '/payees/merge', { sourceIds: [id], targetId: 'p1' });
    expect(partial.body).toMatchObject({ moved: 1, skipped: 1, keptSourceIds: [id] });
    expect((await call('GET', `/bookings/${locked.id}`)).body['booking'].payeeId).toBe(id);
    const all = await call('POST', '/payees/merge', {
      sourceIds: [id],
      targetId: 'p1',
      unlockReconciled: true,
    });
    expect(all.body).toMatchObject({ moved: 1, skipped: 0, keptSourceIds: [] });
    await call('POST', '/undo', { groupId: all.body['groupId'] });
    await call('POST', '/undo', { groupId: partial.body['groupId'] });
    expect(
      ((await call('GET', '/payees')).body['payees'] as Array<{ id: string }>).some(
        (p) => p.id === id,
      ),
    ).toBe(true);
    expect((await call('PATCH', '/payees/payee-reconciliation', { name: 'x' })).status).toBe(409);
  });

  it('serves the pick lists', async () => {
    const lookups = (await call('GET', '/lookups')).body;
    expect(lookups['categories'].map((c: { id: string }) => c.id).sort()).toEqual([
      'auslagen',
      'essen',
      'miete',
    ]);
    expect(lookups['groups']).toEqual([{ id: 'g', name: 'Fixkosten', sortOrder: 0 }]);
    expect(lookups['incomeTypes'].length).toBeGreaterThan(0);
  });
});

describe('Kontostand prüfen', () => {
  const setup = async () => {
    const a = await newAccount();
    await newBooking(a.id, { date: '2026-03-01', amountCents: 20_000, categoryId: null });
    const spent = await newBooking(a.id, { date: '2026-03-15', amountCents: -3000, payeeId: 'p1' });
    return { a, spent };
  };

  it('previews a duplicate and reconciles after removing it', async () => {
    const { a, spent } = await setup();
    const twin = await newBooking(a.id, { date: '2026-03-15', amountCents: -3000, payeeId: 'p1' });
    const preview = (
      await call('POST', `/accounts/${a.id}/reconciliation/preview`, {
        date: TODAY,
        statementBalanceCents: 117_000,
      })
    ).body['preview'];
    expect(preview).toMatchObject({ differenceCents: 3000, missing: null });
    expect(preview.duplicates[0]).toMatchObject({
      removeId: twin.id,
      keepId: spent.id,
      explainsDifference: true,
    });
    const refused = await call('POST', `/accounts/${a.id}/reconciliation`, {
      date: TODAY,
      statementBalanceCents: 117_000,
    });
    expect(refused).toMatchObject({ status: 409, body: { error: 'conflict' } });
    const done = await call('POST', `/accounts/${a.id}/reconciliation`, {
      date: TODAY,
      statementBalanceCents: 117_000,
      removeBookingIds: [twin.id],
    });
    expect(done.body['result']).toMatchObject({
      differenceCents: 0,
      adjustmentBookingId: null,
      reconciledCount: 2,
    });
    expect(done.body['account']).toMatchObject({ lastReconciledOn: TODAY, balanceCents: 117_000 });
    const history = (await call('GET', `/accounts/${a.id}/reconciliations`)).body[
      'reconciliations'
    ];
    expect(history).toEqual([
      expect.objectContaining({ statementBalanceCents: 117_000, clearedBalanceCents: 117_000 }),
    ]);
  });

  it('books the Ausgleich and undoes the whole check', async () => {
    const { a } = await setup();
    const done = await call('POST', `/accounts/${a.id}/reconciliation`, {
      date: TODAY,
      statementBalanceCents: 116_000,
      adjust: true,
      note: 'März',
    });
    const result = done.body['result'];
    expect(result).toMatchObject({ differenceCents: -1000 });
    const adjustment = (await call('GET', `/bookings/${result.adjustmentBookingId}`)).body[
      'booking'
    ];
    expect(adjustment).toMatchObject({
      amountCents: -1000,
      status: 'reconciled',
      payeeName: 'Korrektur Kontoprüfung',
    });
    await call('POST', '/undo', { groupId: result.groupId });
    expect((await call('GET', `/bookings/${result.adjustmentBookingId}`)).status).toBe(404);
    expect((await call('GET', `/accounts/${a.id}`)).body['account']).toMatchObject({
      lastReconciledOn: null,
      balanceCents: 117_000,
    });
  });

  it('refuses a check day after today', async () => {
    const { a } = await setup();
    const later = await newBooking(a.id, { date: '2026-04-02', amountCents: -500 });
    for (const path of ['reconciliation/preview', 'reconciliation']) {
      const res = await call('POST', `/accounts/${a.id}/${path}`, {
        date: '2026-04-02',
        statementBalanceCents: 116_500,
      });
      expect(res, path).toMatchObject({ status: 422, body: { error: 'invariant' } });
    }
    expect((await call('GET', `/bookings/${later.id}`)).body['booking'].status).toBe('confirmed');
  });

  it('answers 404 for unknown accounts and 400 for bad input', async () => {
    expect(
      (
        await call('POST', '/accounts/none/reconciliation/preview', {
          date: TODAY,
          statementBalanceCents: 0,
        })
      ).status,
    ).toBe(404);
    const a = await newAccount();
    expect(
      (
        await call('POST', `/accounts/${a.id}/reconciliation/preview`, {
          date: TODAY,
          statementBalanceCents: 1.5,
        })
      ).status,
    ).toBe(400);
  });
});

describe('protocol', () => {
  it('refuses broken JSON and unknown routes', async () => {
    const res = await app.request('/api/accounts', {
      method: 'POST',
      body: '{nope',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(400);
    expect((await call('GET', '/accounts/none')).status).toBe(404);
    expect((await call('GET', '/nope')).status).toBe(404);
  });
});
