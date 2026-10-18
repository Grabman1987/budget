/* eslint-disable @typescript-eslint/no-explicit-any -- Validate JSON boundary answers. */
import { createTestDatabase, schema, type OpenedDatabase } from '@budget/db';
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
const get = async (path: string) => (await app.request(path)).json() as Promise<any>;
type Kind = typeof schema.inboxItem.$inferInsert.kind;
const store = (id: string, kind: Kind, refType: string | null) =>
  opened.db
    .insert(schema.inboxItem)
    .values({ id, kind, title: `Aufgabe ${id}`, refType, createdAt: '2026-09-17T12:00:00Z' })
    .run();

describe('inbox segments (Konten › Prüfen)', () => {
  it('counts both parts, opens on the part with work and keeps the pill equal to the sum', async () => {
    store('task-a', 'consent', null);
    store('task-b', 'stale_value', null);
    const auto = await get('/inbox?limit=50&segment=auto');
    expect(auto.segment).toBe('aufgaben');
    expect(auto.segments).toEqual({ umsaetze: 0, aufgaben: 2 });
    expect(auto.entries.map((e: any) => e.id).sort()).toEqual(['task-a', 'task-b']);
    const umsaetze = await get('/inbox?limit=50&segment=umsaetze');
    expect(umsaetze.segment).toBe('umsaetze');
    expect(umsaetze.entries).toEqual([]);
    expect(umsaetze.segments).toEqual(auto.segments);
    const pill = await get('/inbox/count');
    expect(pill.count).toBe(auto.segments.umsaetze + auto.segments.aufgaben);
  });

  it('leaves the response unchanged without a segment', async () => {
    store('task-a', 'consent', null);
    const whole = await get('/inbox?limit=50');
    expect(whole.segment).toBeUndefined();
    expect(whole.segments).toBeUndefined();
    expect(whole.entries).toHaveLength(1);
  });

  it('rejects an unknown segment', async () => {
    expect((await app.request('/inbox?segment=alles')).status).toBe(400);
  });
});
