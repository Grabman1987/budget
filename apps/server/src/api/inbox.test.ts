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
import { randomUUID } from 'node:crypto';
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
  it('excludes read-source movements from every count, retains balance warnings and summarizes each source', async () => {
    for (const [id, title, refId, resolvedAt] of [
      ['move-a', 'Quellbewegung: Zuordnung fehlt', 'crypto', null],
      ['move-b', 'Quellbewegung: fehlt in der App', 'crypto', null],
      ['format', 'Quellbewegung: Datenformat prüfen', 'crypto', null],
      ['other-source', 'Quellbewegung: Anlage prüfen', 'source-b', null],
      ['balance', 'Quellsaldo: Bestand prüfen', 'crypto', null],
      ['done', 'Quellbewegung: Zuordnung fehlt', 'crypto', '2026-09-17T12:00:00Z'],
    ])
      opened.db
        .insert(schema.inboxItem)
        .values({
          id: id!,
          kind: 'import',
          title: title!,
          refType: 'read_source',
          refId,
          resolvedAt,
          createdAt: '2026-09-17T12:00:00Z',
        })
        .run();
    const whole = await call('GET', '/inbox');
    expect(whole.body.entries.map((e: any) => e.id)).toEqual(['balance']);
    expect(whole.body.count).toBe(1);
    expect(whole.body.readSourceSummaries).toEqual([
      { sourceId: 'crypto', name: 'Krypto-Lesequelle', count: 3 },
      { sourceId: 'source-b', name: 'Lesequelle source-b', count: 1 },
    ]);
    expect((await call('GET', '/inbox/count')).body.count).toBe(1);
    expect((await call('GET', '/heute')).body.attention.inboxCount).toBe(1);
    expect((await call('GET', '/inbox?limit=1')).body).toMatchObject({
      count: 1,
      totalEntries: 1,
      countsByKind: { import: 1 },
      next: null,
    });
    expect(
      (await call('GET', '/inbox?bankSource=10000000-0000-4000-8000-000000000001')).body
        .readSourceSummaries,
    ).toEqual([]);
    expect(
      opened.db
        .select()
        .from(schema.inboxItem)
        .all()
        .filter((i) => !i.resolvedAt),
    ).toHaveLength(5);
  });

  it('filters source movements by title before pagination and preserves resolve and undo', async () => {
    for (const [id, title] of [
      ['a', 'Quellbewegung: Zuordnung fehlt'],
      ['b', 'Quellbewegung: Zuordnung fehlt'],
      ['c', 'Quellbewegung: Datenformat prüfen'],
      ['balance', 'Quellsaldo: Bestand prüfen'],
    ])
      opened.db
        .insert(schema.inboxItem)
        .values({
          id: id!,
          kind: 'import',
          title: title!,
          refType: 'read_source',
          refId: 'crypto',
          createdAt: '2026-09-17T12:00:00Z',
        })
        .run();
    const query =
      '/inbox?readSource=crypto&limit=1&title=' +
      encodeURIComponent('Quellbewegung: Zuordnung fehlt');
    const first = await call('GET', query);
    expect(first.body).toMatchObject({
      count: 3,
      totalEntries: 2,
      next: 1,
      countsByTitle: {
        'Quellbewegung: Zuordnung fehlt': 2,
        'Quellbewegung: Datenformat prüfen': 1,
      },
    });
    expect(first.body.entries.map((e: any) => e.id)).toEqual(['a']);
    expect((await call('GET', query + '&offset=1')).body.entries.map((e: any) => e.id)).toEqual([
      'b',
    ]);
    const resolved = await call('POST', '/inbox/a/resolve', {});
    expect(resolved.status).toBe(200);
    expect((await call('GET', query)).body.count).toBe(2);
    expect((await call('POST', '/undo', { groupId: resolved.body.groupId })).status).toBe(200);
    expect((await call('GET', query)).body.count).toBe(3);
    expect((await call('GET', '/inbox/count')).body.count).toBe(1);
  });
  it('sorts by the bank transaction date and filters inclusively before pagination', async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    for (const [index, date] of ['2026-09-15', '2026-09-01', '2026-09-17'].entries()) {
      opened.db
        .insert(schema.bankSyncCandidate)
        .values({
          id: ids[index]!,
          accountId: 'giro',
          dedupeKey: ids[index]!,
          date,
          amountCents: -1201,
          currency: 'EUR',
          memo: 'Shop A',
        })
        .run();
      opened.db
        .insert(schema.inboxItem)
        .values({
          id: ids[index]!,
          kind: 'import',
          title: 'Bankumsatz prüfen',
          refType: 'bank-sync-candidate',
          refId: ids[index]!,
          createdAt: '2026-09-17T12:00:00Z',
        })
        .run();
    }
    const newest = await call('GET', '/inbox?dateSort=newest&fromDate=2026-09-15&limit=1');
    expect(newest.body).toMatchObject({ totalEntries: 2, next: 1 });
    expect(newest.body.entries[0]).toMatchObject({
      id: ids[2],
      bankCandidate: { date: '2026-09-17', amountCents: -1201 },
    });
    const oldest = await call('GET', '/inbox?dateSort=oldest&limit=100');
    expect(oldest.body.entries.map((e: any) => e.id)).toEqual([ids[1], ids[0], ids[2]]);
    expect((await call('GET', '/inbox?fromDate=2026-02-30')).status).toBe(400);
    expect((await call('GET', '/inbox?dateSort=invalid')).status).toBe(400);
  });
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
          title: 'Quellsaldo: Zuordnung prüfen',
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
      const firstPage = await call('GET', '/inbox?limit=1');
      const historicalPage = await call('GET', '/inbox?period=historical&limit=1');
      const badge = await call('GET', '/inbox/count');
      for (const response of [plan, today, inbox, firstPage, historicalPage, badge])
        expect(response.status).toBe(200);
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
      const envelopeRows = inbox.body.entries.filter((e: any) => e.type === 'envelope');
      expect(envelopeRows.map((e: any) => e.categoryId).sort()).toEqual(expectedIds);
      expect(
        inbox.body.entries
          .filter((e: any) => e.kind === 'overspent')
          .map((e: any) => e.categoryId)
          .sort(),
      ).toEqual(expectedIds);
      const literalDeficits = { essen: 1, reise: 2345 } as Record<string, number>;
      expect(
        envelopeRows
          .map((e: any) => [e.categoryId, e.deficitCents])
          .sort((a: any, b: any) => a[0].localeCompare(b[0])),
      ).toEqual(expectedIds.map((id) => [id, literalDeficits[id]]));
      expect(inbox.body.overspentSummary).toEqual(
        expectedIds.length
          ? {
              month: '2026-09',
              count: expectedIds.length,
              deficitCents: expectedIds.reduce((sum, id) => sum + literalDeficits[id]!, 0),
            }
          : undefined,
      );
      expect(firstPage.body).toMatchObject({
        count: expectedIds.length,
        totalEntries: expectedIds.length,
        entries: [expect.objectContaining({ type: 'envelope' })],
        ...(expectedIds.length
          ? {
              overspentSummary: {
                month: '2026-09',
                count: expectedIds.length,
                deficitCents: expectedIds.reduce((sum, id) => sum + literalDeficits[id]!, 0),
              },
            }
          : { overspentSummary: undefined }),
      });
      expect(historicalPage.body.overspentSummary).toBeUndefined();
      expect(inbox.body.count).toBe(expectedIds.length);
      // Header pill = Umsätze + Aufgaben (#561): overspent envelopes are not part of it; this fixture
      // holds no other open item, so the literal expected value is 0.
      expect(badge.body.count).toBe(0);
      // Heute "zu prüfen" = Prüfen pill (#666): overspent envelopes keep their own Zu-tun row above.
      expect(today.body.attention.inboxCount).toBe(0);
      expect(today.body.attention.inboxCount).toBe(badge.body.count);
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
    expect(Object.keys(whole.body).sort()).toEqual([
      'asOf',
      'count',
      'entries',
      'readSourceSummaries',
    ]);
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
