/* eslint-disable @typescript-eslint/no-explicit-any -- Validate JSON boundary answers. */
import {
  createBooking,
  accounts,
  categories,
  setAssigned,
  createTestDatabase,
  insertTracked,
  schema,
  type OpenedDatabase,
} from '@budget/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';
let opened: OpenedDatabase;
let app: ReturnType<typeof createLedgerApi>;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  app = createLedgerApi({
    db: opened.db,
    today: () => '2026-09-17',
    stepUp: async (_c, next) => next(),
  });
});
afterEach(() => opened.close());
async function call(method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as any };
}
describe('inbox API', () => {
  it('shares the current overspent envelopes with Heute, Plan and badge; cover and undo update all consumers', async () => {
    const ctx = { actor: 'test' };
    accounts.create(
      opened.db,
      {
        id: 'card',
        name: 'Testkarte',
        type: 'credit_card',
        role: 'debt',
        onBudget: true,
        openingDate: '2026-08-01',
        openingBalanceCents: -5000,
      },
      ctx,
    );
    categories.create(
      opened.db,
      {
        id: 'card-payment',
        name: 'Kartenzahlung',
        kind: 'card_payment',
        groupId: 'g',
        class: null,
        cardAccountId: 'card',
      },
      ctx,
    );
    for (const [accountId, categoryId, amountCents] of [
      ['giro', 'essen', -1],
      ['card', 'reise', -2345],
    ] as const)
      createBooking(
        opened.db,
        { accountId, date: '2026-09-10', amountCents, splits: [{ categoryId, amountCents }] },
        ctx,
      );
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-08-10',
        amountCents: -123,
        splits: [{ categoryId: 'miete', amountCents: -123 }],
      },
      ctx,
    );
    // Duplicate/stale stored envelope warnings must never add to the derived month.
    for (const id of ['legacy-one', 'legacy-two'])
      insertTracked(
        opened.db,
        schema.inboxItem,
        { id, kind: 'overspent', title: 'Alter Warnstand', refType: 'category', refId: 'essen' },
        ctx,
      );
    const assertConsumers = async (expectedIds: string[]) => {
      const plan = await call('GET', '/budget/2026-09');
      const today = await call('GET', '/heute');
      const inbox = await call('GET', '/inbox');
      const badge = await call('GET', '/inbox/count');
      for (const response of [plan, today, inbox, badge]) expect(response.status).toBe(200);
      expect(
        plan.body.summary.envelopes
          .filter((e: any) => e.availableCents < 0)
          .map((e: any) => e.categoryId)
          .sort(),
      ).toEqual(expectedIds);
      expect(
        today.body.nextSteps.items
          .filter((e: any) => e.kind === 'overspent')
          .map((e: any) => e.categoryId)
          .sort(),
      ).toEqual(expectedIds);
      expect(
        inbox.body.entries
          .filter((e: any) => e.kind === 'overspent')
          .map((e: any) => e.categoryId)
          .sort(),
      ).toEqual(expectedIds);
      expect(inbox.body.count).toBe(expectedIds.length);
      expect(badge.body.count).toBe(expectedIds.length);
      expect(today.body.attention.inboxCount).toBe(expectedIds.length);
    };
    await assertConsumers(['essen', 'reise']);
    const derived = (await call('GET', '/inbox')).body.entries[0];
    expect((await call('POST', `/inbox/${derived.id}/resolve`, {})).status).toBe(404);
    const covered = await call('POST', '/budget/2026-09/cover', {
      categoryId: 'essen',
      fromId: null,
    });
    expect(covered.status).toBe(200);
    await assertConsumers(['reise']);
    const undone = await call('POST', '/undo', { groupId: covered.body.groupId });
    expect(undone.status).toBe(200);
    await assertConsumers(['essen', 'reise']);
  });
  it('returns literal count, categorizes through booking API and restores work with undo', async () => {
    setAssigned(opened.db, 'essen', '2026-09', 1250, { actor: 'test' });
    const bookingId = createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-09-17',
        amountCents: -1250,
        splits: [{ amountCents: -1250 }],
      },
      { actor: 'test' },
    );
    insertTracked(
      opened.db,
      schema.inboxItem,
      { id: 'warning', kind: 'stale_value', title: 'Kurse fehlen', refType: 'fx', refId: 'USD' },
      { actor: 'test' },
    );
    expect((await call('GET', '/inbox/count')).body.count).toBe(2);
    expect((await call('GET', '/inbox')).body.entries.map((e: any) => e.type)).toEqual([
      'booking',
      'stored',
    ]);
    const edited = await call('PATCH', `/bookings/${bookingId}`, {
      splits: [{ amountCents: -1250, categoryId: 'essen' }],
    });
    expect(edited.status).toBe(200);
    expect((await call('GET', '/inbox/count')).body.count).toBe(1);
    expect((await call('POST', '/undo', { groupId: edited.body.groupId })).status).toBe(200);
    expect((await call('GET', '/inbox/count')).body.count).toBe(2);
    const resolved = await call('POST', '/inbox/warning/resolve', {});
    expect(resolved.status).toBe(200);
    expect((await call('GET', '/inbox/count')).body.count).toBe(1);
    expect((await call('POST', '/undo', { groupId: resolved.body.groupId })).status).toBe(200);
    expect((await call('GET', '/inbox/count')).body.count).toBe(2);
  });
  it('rejects unknown and booking IDs, extra mutation fields and already resolved tasks', async () => {
    const bookingId = createBooking(
      opened.db,
      { accountId: 'giro', date: '2026-09-17', amountCents: -100, splits: [{ amountCents: -100 }] },
      { actor: 'test' },
    );
    expect((await call('POST', '/inbox/missing/resolve', {})).status).toBe(404);
    expect((await call('POST', `/inbox/${bookingId}/resolve`, {})).status).toBe(404);
    insertTracked(
      opened.db,
      schema.inboxItem,
      { id: 'warning', kind: 'backup', title: 'Sicherung prüfen' },
      { actor: 'test' },
    );
    expect((await call('POST', '/inbox/warning/resolve', { refId: bookingId })).status).toBe(400);
    expect((await call('POST', '/inbox/warning/resolve', {})).status).toBe(200);
    expect((await call('POST', '/inbox/warning/resolve', {})).status).toBe(409);
    expect((await call('GET', '/inbox/count')).body.count).toBe(1);
  });
});
