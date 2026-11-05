import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTestDatabase,
  createBooking,
  updateBooking,
  deleteBooking,
  undo,
  schema,
  holdWrites,
  releaseWrites,
  type OpenedDatabase,
} from '@budget/db';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { spritmonitorSync, spritmonitorConfigFromEnv } from './spritmonitor-sync';
import type { SpritmonitorFueling } from './spritmonitor-api';
import { Hono } from 'hono';
import { createApp } from '../app';

let opened: OpenedDatabase;
let payload: SpritmonitorFueling[];
const initial = new Date('2026-11-01T12:00:00Z');
const later = new Date('2026-11-05T12:00:00Z');
const config = {
  vehicleId: 123,
  tankId: 456,
  accountId: 'giro',
  categoryId: 'essen',
  startDate: '2026-10-01',
};
const row = (id = 1, date = '2026-11-04'): SpritmonitorFueling => ({
  sourceId: `spritmonitor:123:456:${id}`,
  remoteId: id,
  vehicleId: 123,
  tankId: 456,
  date,
  stationName: 'Synthetic Fuel',
  location: null,
  note: null,
  status: 'importable',
  currency: 'EUR',
  amountCents: -7255,
});
function service(fetchRows = async () => payload) {
  return spritmonitorSync(opened.db, {
    config: () => config,
    client: { configured: () => true, fuelings: vi.fn(fetchRows) },
  });
}
function counts() {
  return {
    bookings: opened.db.select().from(schema.booking).all(),
    settings: opened.db.select().from(schema.appSetting).all(),
    audit: opened.db.select().from(schema.auditLog).all(),
    inbox: opened.db.select().from(schema.inboxItem).all(),
  };
}
function manual(amount = -7000, date = '2026-11-04') {
  return createBooking(
    opened.db,
    {
      accountId: 'spar',
      date,
      amountCents: amount,
      status: 'confirmed',
      memo: 'Synthetic fuel expense',
      splits: [{ categoryId: 'essen', amountCents: amount }],
    },
    { actor: 'tester' },
  );
}
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  payload = [];
});
afterEach(() => opened.close());

describe('bounded Spritmonitor ledger sync', () => {
  it('defaults OFF and rejects incomplete explicitly enabled configuration', () => {
    expect(spritmonitorConfigFromEnv({})).toBeNull();
    expect(() => spritmonitorConfigFromEnv({ BUDGET_SPRITMONITOR_ENABLED: '1' })).toThrow();
  });
  it('bootstraps existing source history to review; explicit link preserves net amount and provenance', async () => {
    const existing = manual(-7000, '2026-10-31');
    payload = [row(1, '2026-10-31')];
    const sync = service();
    const result = await sync.refresh(initial);
    expect(result).toMatchObject({ imported: 0, review: 1 });
    const record = sync.status().rows[0]!;
    sync.resolve(record.key, record.reviewFingerprint, 'link', existing);
    const booked = opened.db.select().from(schema.booking).all();
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({
      id: existing,
      amountCents: -7000,
      accountId: 'spar',
      source: 'manual',
      importKey: null,
    });
    expect(await sync.refresh(later)).toMatchObject({ imported: 0, review: 0 });
  });
  it('automatically imports a new clear expense pending, with exact cents, category and no contacts', async () => {
    const sync = service();
    await sync.refresh(initial);
    payload = [row()];
    const result = await sync.refresh(later);
    expect(result).toMatchObject({ imported: 1, review: 0 });
    const b = counts().bookings[0]!;
    expect(b).toMatchObject({
      accountId: 'giro',
      amountCents: -7255,
      date: '2026-11-04',
      status: 'pending',
      importKey: 'spritmonitor:123:456:1',
    });
    expect(opened.db.select().from(schema.bookingSplit).all()).toEqual([
      expect.objectContaining({ categoryId: 'essen', amountCents: -7255, contactId: null }),
    ]);
    const before = counts();
    expect(await sync.refresh(later)).toMatchObject({ imported: 0, review: 0, groupId: null });
    expect(counts()).toEqual(before);
  });
  it('preserves manual account/amount/category edits and never recreates a deleted import', async () => {
    const sync = service();
    await sync.refresh(initial);
    payload = [row()];
    await sync.refresh(later);
    const id = counts().bookings[0]!.id;
    updateBooking(
      opened.db,
      id,
      {
        accountId: 'spar',
        amountCents: -7000,
        splits: [{ categoryId: 'reise', amountCents: -7000 }],
      },
      { actor: 'owner' },
    );
    const edited = counts();
    await sync.refresh(later);
    expect(counts()).toEqual(edited);
    deleteBooking(opened.db, id, { actor: 'owner' });
    const deleted = counts();
    await sync.refresh(later);
    expect(counts()).toEqual(deleted);
  });
  it('native grouped Undo removes money and retained audit identity suppresses reimport', async () => {
    const sync = service();
    await sync.refresh(initial);
    payload = [row()];
    const result = await sync.refresh(later);
    undo(opened.db, { groupId: result.groupId! }, { actor: 'owner' });
    const before = counts();
    await sync.refresh(later);
    expect(counts()).toEqual(before);
    expect(counts().bookings.filter((b) => !b.deletedAt)).toHaveLength(0);
  });
  it('routes changed source costs to review without changing the booking; repeat is write-free', async () => {
    const sync = service();
    await sync.refresh(initial);
    payload = [row()];
    await sync.refresh(later);
    payload = [{ ...row(), amountCents: -7400 } as SpritmonitorFueling];
    expect(await sync.refresh(later)).toMatchObject({ imported: 0, review: 1 });
    expect(counts().bookings[0]!.amountCents).toBe(-7255);
    expect(sync.status().rows[0]).toMatchObject({
      reason: 'source_changed',
      fingerprint: expect.any(String),
    });
    const before = counts();
    await sync.refresh(later);
    expect(counts()).toEqual(before);
  });
  it('invalidates the stale review token when a changed source returns to its accepted snapshot', async () => {
    const sync = service();
    await sync.refresh(initial);
    payload = [row()];
    await sync.refresh(later);
    const original = sync.status().rows[0]!;
    payload = [{ ...row(), amountCents: -7400 } as SpritmonitorFueling];
    await sync.refresh(later);
    const changed = sync.status().rows[0]!;
    payload = [row()];
    expect(await sync.refresh(later)).toMatchObject({ imported: 0, review: 1 });
    const reverted = sync.status().rows[0]!;
    expect(reverted.reviewFingerprint).toBe(original.fingerprint);
    expect(reverted.reviewFingerprint).not.toBe(changed.reviewFingerprint);
    expect(() => sync.resolve(reverted.key, changed.reviewFingerprint, 'ignore')).toThrow();
    expect(counts().bookings[0]!.amountCents).toBe(-7255);
    const before = counts();
    await sync.refresh(later);
    expect(counts()).toEqual(before);
  });
  it('bootstraps each explicitly configured vehicle and tank independently', async () => {
    let selected = { ...config };
    const sync = spritmonitorSync(opened.db, {
      config: () => selected,
      client: { configured: () => true, fuelings: async () => payload },
    });
    await sync.refresh(initial);
    selected = { ...config, vehicleId: 789, tankId: 987 };
    payload = [{ ...row(), sourceId: 'spritmonitor:789:987:1', vehicleId: 789, tankId: 987 }];
    expect(await sync.refresh(later)).toMatchObject({ imported: 0, review: 1 });
    expect(sync.status().state).toMatchObject({
      vehicleId: 789,
      tankId: 987,
      bootstrapThrough: '2026-11-05',
    });
    expect(counts().bookings).toHaveLength(0);
    selected = { ...config };
    expect(sync.status().state).toMatchObject({
      vehicleId: 123,
      tankId: 456,
      bootstrapThrough: '2026-11-01',
    });
  });
  it('does not reuse another source same-day scheduled success', async () => {
    let selected = { ...config };
    const fetchRows = vi.fn(async () => payload);
    const sync = spritmonitorSync(opened.db, {
      config: () => selected,
      client: { configured: () => true, fuelings: fetchRows },
    });
    await sync.refresh(later);
    selected = { ...config, vehicleId: 789, tankId: 987 };
    payload = [{ ...row(), sourceId: 'spritmonitor:789:987:1', vehicleId: 789, tankId: 987 }];
    await sync.ifDue(new Date('2026-11-05T13:00:00Z'));
    expect(fetchRows).toHaveBeenCalledTimes(2);
    expect(sync.status().state).toMatchObject({
      vehicleId: 789,
      tankId: 987,
      bootstrapThrough: '2026-11-05',
    });
    expect(counts().bookings).toHaveLength(0);
    expect(sync.status().rows[0]!.status).toBe('review');
  });
  it('allows one explicit booking of a corrected, never-booked bootstrap review', async () => {
    payload = [row(1, '2026-10-31')];
    const sync = service();
    await sync.refresh(initial);
    payload = [{ ...row(1, '2026-10-31'), amountCents: -7400 } as SpritmonitorFueling];
    await sync.refresh(later);
    const corrected = sync.status().rows[0]!;
    const result = sync.resolve(corrected.key, corrected.reviewFingerprint, 'book');
    expect(counts().bookings).toEqual([
      expect.objectContaining({ amountCents: -7400, status: 'pending' }),
    ]);
    expect(() => sync.resolve(corrected.key, corrected.reviewFingerprint, 'book')).toThrow();
    undo(opened.db, { groupId: result.groupId }, { actor: 'owner' });
    expect(() => sync.resolve(corrected.key, corrected.reviewFingerprint, 'book')).toThrow();
    expect(counts().bookings.filter((b) => !b.deletedAt)).toHaveLength(0);
  });
  it('does not infer discounts: a possible existing net fuel purchase blocks a gross import', async () => {
    const sync = service();
    await sync.refresh(initial);
    manual(-6850);
    payload = [row()];
    expect(await sync.refresh(later)).toMatchObject({ imported: 0, review: 1 });
    expect(counts().bookings).toHaveLength(1);
    expect(sync.status().rows[0]!.reason).toBe('possible_duplicate');
  });
  it('future scheduled fuel bookings outside the event date window do not block new fuelings', async () => {
    const sync = service();
    await sync.refresh(initial);
    manual(-6850, '2026-12-01');
    payload = [row()];
    expect(await sync.refresh(later)).toMatchObject({ imported: 1, review: 0 });
  });
  it('stages unsupported currency/missing cost for review and does not invent money', async () => {
    const sync = service();
    await sync.refresh(initial);
    payload = [
      {
        ...row(),
        status: 'unsupported',
        reason: 'missing_cost',
        currency: 'EUR',
        sourceAmount: null,
      },
    ];
    expect(await sync.refresh(later)).toMatchObject({ imported: 0, review: 1 });
    expect(counts().bookings).toHaveLength(0);
  });
  it('rejects the entire response before writes when any row is invalid', async () => {
    const sync = service();
    await sync.refresh(initial);
    payload = [row(), { ...row(2), amountCents: -1.5 } as SpritmonitorFueling];
    const before = counts();
    await expect(sync.refresh(later)).rejects.toThrow();
    expect(counts()).toEqual(before);
  });
  it('rejects source freshness changes and a write hold acquired during the network read', async () => {
    const sync = service(async () => {
      manual();
      return [row()];
    });
    await expect(sync.refresh(later)).rejects.toThrow(/geändert/);
    expect(counts().settings).toHaveLength(0);
    const held = service(async () => {
      holdWrites(opened.db);
      return [row()];
    });
    await expect(held.refresh(later)).rejects.toThrow(/läuft/);
    expect(counts().settings).toHaveLength(0);
    releaseWrites(opened.db);
  });
  it('explicit review booking Undo returns to review and cannot recreate money by retry', async () => {
    payload = [row(1, '2026-10-31')];
    const sync = service();
    await sync.refresh(initial);
    const record = sync.status().rows[0]!;
    const result = sync.resolve(record.key, record.reviewFingerprint, 'book');
    undo(opened.db, { groupId: result.groupId }, { actor: 'owner' });
    await sync.refresh(later);
    expect(() => sync.resolve(record.key, record.reviewFingerprint, 'book')).toThrow();
    expect(counts().bookings.filter((b) => !b.deletedAt)).toHaveLength(0);
  });
  it('closed or non-EUR destinations fail closed without source or ledger writes', async () => {
    const sync = spritmonitorSync(opened.db, {
      config: () => ({ ...config, accountId: 'usd' }),
      client: { configured: () => true, fuelings: vi.fn(async () => [row()]) },
    });
    const before = counts();
    await expect(sync.refresh(later)).rejects.toThrow();
    expect(counts()).toEqual(before);
  });
  it('recognizes a global source key on another account without existing source settings', async () => {
    createBooking(
      opened.db,
      {
        accountId: 'spar',
        date: '2026-11-04',
        amountCents: -7255,
        status: 'pending',
        source: 'import',
        importKey: row().sourceId,
        splits: [{ categoryId: 'essen', amountCents: -7255 }],
      },
      { actor: 'tester' },
    );
    payload = [row()];
    const sync = service();
    expect(await sync.refresh(later)).toMatchObject({ imported: 0, linked: 1 });
    expect(counts().bookings).toHaveLength(1);
    expect(sync.status().rows[0]!.bookingId).toBe(counts().bookings[0]!.id);
  });
  it('rolls back money and audit when a source-state write fails after booking creation', async () => {
    const sync = service();
    await sync.refresh(initial);
    payload = [row()];
    opened.sqlite.exec(
      "CREATE TRIGGER synthetic_source_failure BEFORE INSERT ON app_setting WHEN NEW.id LIKE 'spritmonitor.row.%' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
    );
    const before = counts();
    await expect(sync.refresh(later)).rejects.toThrow();
    expect(counts()).toEqual(before);
  });
  it('source deletion leaves an existing ledger booking untouched', async () => {
    const sync = service();
    await sync.refresh(initial);
    payload = [row()];
    await sync.refresh(later);
    const before = counts();
    payload = [];
    await sync.refresh(later);
    expect(counts()).toEqual(before);
  });
});

describe('Spritmonitor API boundaries', () => {
  it('inherits session/origin protection and requires a passkey session on every write', async () => {
    let authenticated = false,
      passkey = false;
    const app = createApp({
      webDir: 'test-results/no-web',
      ledger: { db: opened.db, bankSync: null },
      auth: {
        routes: new Hono(),
        requireSession: async (c, next) =>
          authenticated ? next() : c.json({ error: 'unauthorized' }, 401),
        originGuard: async (c, next) =>
          c.req.method === 'GET' || c.req.header('origin') === 'https://budget.example'
            ? next()
            : c.json({ error: 'origin_rejected' }, 403),
        requireStepUp: async (c) => c.json({ error: 'step_up_required' }, 403),
        requirePasskeySession: async (c, next) =>
          passkey ? next() : c.json({ error: 'passkey_required' }, 403),
      },
    });
    const path = '/api/sources/spritmonitor';
    expect((await app.request(path)).status).toBe(401);
    authenticated = true;
    expect((await app.request(path)).status).toBe(200);
    expect((await app.request(path + '/refresh', { method: 'POST', body: '{}' })).status).toBe(403);
    const headers = { origin: 'https://budget.example', 'content-type': 'application/json' };
    expect(
      (await app.request(path + '/refresh', { method: 'POST', headers, body: '{}' })).status,
    ).toBe(403);
    expect(
      (await app.request(path + '/resolve', { method: 'POST', headers, body: '{}' })).status,
    ).toBe(403);
    passkey = true;
    expect(
      (await app.request(path + '/resolve', { method: 'POST', headers, body: '{}' })).status,
    ).toBe(400);
    expect(
      (
        await app.request(path + '/refresh', {
          method: 'POST',
          headers,
          body: '{"unrecognized":true}',
        })
      ).status,
    ).toBe(400);
  });
});
