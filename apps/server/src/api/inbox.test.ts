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
  it('filters before pagination, counts repeated causes and reads details without resolving work', async () => {
    for (const [id, date, reason] of [
      ['old', '2026-08-31', 'mapping_required'],
      ['current-a', '2026-09-01', 'mapping_required'],
      ['current-b', '2026-09-17', 'mapping_required'],
      ['different', '2026-09-17', 'schema'],
    ])
      insertTracked(
        opened.db,
        schema.inboxItem,
        {
          id: id!,
          kind: 'import',
          title: 'Zuordnung prüfen',
          refType: 'read_source',
          refId: 'synthetic-source',
          detail: JSON.stringify({ reason, source: { id } }),
          createdAt: `${date}T12:00:00.000Z`,
        },
        { actor: 'test' },
      );
    const current = await call('GET', '/inbox?period=current&limit=1');
    expect(current.status).toBe(200);
    expect(current.body).toMatchObject({
      count: 4,
      totalEntries: 3,
      next: 1,
      countsByKind: { import: 3 },
    });
    expect(current.body.entries.map((e: any) => e.id)).toEqual(['current-a']);
    expect(Object.values(current.body.countsByCause).sort()).toEqual([1, 2]);
    const historical = await call('GET', '/inbox?period=historical&limit=100');
    expect(historical.body.entries.map((e: any) => e.id)).toEqual(['old']);
    expect(historical.body.count).toBe(4);
    expect((await call('GET', '/inbox/current-b')).body.entry).toMatchObject({
      id: 'current-b',
      detail: expect.stringContaining('mapping_required'),
    });
    expect((await call('GET', '/inbox/missing')).status).toBe(404);
    expect((await call('GET', '/inbox?period=invalid')).status).toBe(400);
    expect((await call('GET', '/inbox')).body.entries).toHaveLength(4);
    expect((await call('GET', '/inbox/count')).body.count).toBe(4);
  });
  it('validates source filters and excludes unrelated work before pagination', async () => {
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-09-17',
        amountCents: -501,
        splits: [{ amountCents: -501 }],
      },
      { actor: 'tester' },
    );
    const filtered = await call(
      'GET',
      '/inbox?bankSource=10000000-0000-4000-8000-000000000001&limit=1',
    );
    expect(filtered.status).toBe(200);
    expect(filtered.body).toMatchObject({ count: 0, totalEntries: 0, entries: [], next: null });
    expect((await call('GET', '/inbox?bankSource=invalid')).status).toBe(400);
    expect((await call('GET', '/inbox')).body.count).toBe(1);
  });
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

  it('pages 301 tasks without gaps or overlap while every page retains full counts', async () => {
    const ctx = { actor: 'test' };
    const expectedIds = Array.from({ length: 301 }, (_, i) => `page-${String(i).padStart(3, '0')}`);
    for (let i = 0; i < expectedIds.length; i++) {
      const minute = String(Math.floor(i / 60)).padStart(2, '0');
      const second = String(i % 60).padStart(2, '0');
      insertTracked(
        opened.db,
        schema.inboxItem,
        {
          id: expectedIds[i]!,
          kind: i < 150 ? 'import' : 'other',
          title: `Aufgabe ${String(i).padStart(3, '0')}`,
          createdAt: `2026-09-01T00:${minute}:${second}.000Z`,
        },
        ctx,
      );
    }
    for (const [id, kind] of [
      ['legacy-uncategorized', 'uncategorized'],
      ['legacy-overspent', 'overspent'],
    ] as const)
      insertTracked(opened.db, schema.inboxItem, { id, kind, title: 'Legacy' }, ctx);
    insertTracked(
      opened.db,
      schema.inboxItem,
      {
        id: 'resolved-page-task',
        kind: 'backup',
        title: 'Erledigt',
        resolvedAt: '2026-09-01T00:00:00.000Z',
        resolution: 'Erledigt',
      },
      ctx,
    );
    // Synthetic metadata only: the inbox badge counts this unlinked receipt outside task entries.
    insertTracked(
      opened.db,
      schema.receipt,
      {
        id: 'unlinked-page-receipt',
        storageKey: 'synthetic-receipt',
        mime: 'image/png',
        sizeBytes: 1,
        sha256: 'a'.repeat(64),
        originalFilename: 'synthetic.png',
      },
      ctx,
    );
    const whole = await call('GET', '/inbox');
    expect(whole.status).toBe(200);
    expect(whole.body.entries).toHaveLength(301);
    expect(whole.body.entries.map((entry: any) => entry.id)).toEqual(expectedIds);
    expect(whole.body.count).toBe(302);
    expect(Object.keys(whole.body).sort()).toEqual(['asOf', 'count', 'entries']);
    const pages = await Promise.all(
      [0, 100, 200, 300].map((offset) => call('GET', `/inbox?limit=100&offset=${offset}`)),
    );
    const expectedNext = [100, 200, 300, null];
    const expectedLengths = [100, 100, 100, 1];
    pages.forEach((page, index) => {
      const offset = index * 100;
      expect(page.status).toBe(200);
      expect(page.body).toMatchObject({
        count: 302,
        totalEntries: 301,
        limit: 100,
        offset,
        next: expectedNext[index],
      });
      expect(page.body.countsByKind).toEqual({ import: 150, other: 151 });
      expect(page.body.entries).toHaveLength(expectedLengths[index]!);
      expect(page.body.entries.map((entry: any) => entry.id)).toEqual(
        expectedIds.slice(offset, offset + expectedLengths[index]!),
      );
    });
    const pagedIds = pages.flatMap((page) => page.body.entries.map((entry: any) => entry.id));
    expect(pagedIds).toEqual(expectedIds);
    expect(new Set(pagedIds).size).toBe(301);
    const empty = await call('GET', '/inbox?limit=100&offset=301');
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({
      count: 302,
      totalEntries: 301,
      entries: [],
      limit: 100,
      offset: 301,
      next: null,
    });
    expect(empty.body.countsByKind).toEqual({ import: 150, other: 151 });
    const badge = await call('GET', '/inbox/count');
    expect(badge.status).toBe(200);
    expect(badge.body.count).toBe(302);
    expect((await call('GET', '/inbox?limit=0')).status).toBe(400);
  });
});
