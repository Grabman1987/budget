import { createTestDatabase, schema, type Db, type GlobalSearchResult } from '@budget/db';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AuthGate } from '../app';

const webDir = mkdtempSync(join(tmpdir(), 'budget-search-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Budget</title>');
let db: Db;
let close: () => void;
let allowed: boolean;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  ({ db, close } = createTestDatabase());
  allowed = true;
  db.insert(schema.categoryGroup).values({ id: 'g', name: 'Group' }).run();
  const auth: AuthGate = {
    requireSession: async (c, next) => (allowed ? next() : c.json({ error: 'unauthorized' }, 401)),
    originGuard: async (_c, next) => next(),
    requireStepUp: async (_c, next) => next(),
    routes: new Hono(),
  };
  app = createApp({ webDir, auth, ledger: { db } });
});
afterEach(() => close());
const request = (q: string) => app.request(`/api/search?q=${encodeURIComponent(q)}`);
const results = async (q: string) =>
  ((await (await request(q)).json()) as { results: GlobalSearchResult[] }).results;
function seed(name: string, id: string, deletedAt: string | null = null) {
  db.insert(schema.account)
    .values({
      id,
      name,
      type: 'checking',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-01-01',
      deletedAt,
    })
    .run();
  db.insert(schema.category)
    .values({ id, name, class: 'need', groupId: 'g', kind: 'variable', deletedAt })
    .run();
  db.insert(schema.payee).values({ id, name, deletedAt }).run();
  db.insert(schema.contact).values({ id, name, deletedAt }).run();
  db.insert(schema.booking)
    .values({
      id,
      accountId: id,
      date: '2026-09-01',
      amountCents: -100,
      payeeId: id,
      memo: name,
      deletedAt,
    })
    .run();
}
describe('global search API', () => {
  it('requires the session guard before any search result', async () => {
    seed('Muster', 'live');
    allowed = false;
    const response = await request('Muster');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });
  it('bounds each entity independently, ignores soft deletion, and keeps deterministic order', async () => {
    for (let i = 0; i < 8; i++) seed(`Muster ${i}`, `item-${i}`);
    seed('Muster deleted', 'deleted', '2026-09-02T00:00:00Z');
    const found = await results('muster');
    expect(found).toHaveLength(25);
    expect(new Set(found.map((r) => r.kind))).toEqual(
      new Set(['account', 'category', 'payee', 'contact', 'booking']),
    );
    for (const kind of ['account', 'category', 'payee', 'contact', 'booking']) {
      expect(found.filter((r) => r.kind === kind)).toHaveLength(5);
    }
    expect(found.some((r) => r.id === 'deleted')).toBe(false);
    expect(found.filter((r) => r.kind === 'account').map((r) => r.id)).toEqual([
      'item-0',
      'item-1',
      'item-2',
      'item-3',
      'item-4',
    ]);
    expect(found.find((r) => r.kind === 'booking')?.detail).toContain('01.09.2026');
  });
  it('treats SQL and wildcard text literally and finds German case variants', async () => {
    seed('Übung %_\\', 'literal');
    seed('Muster normal', 'normal');
    expect(await results('%_\\')).toHaveLength(5);
    expect(await results('übung')).toHaveLength(5);
    expect(await results("' OR 1=1 --")).toEqual([]);
  });
  it('rejects missing, blank, short and overlong queries and returns an empty result for no match', async () => {
    expect((await app.request('/api/search')).status).toBe(400);
    for (const q of ['', ' ', 'x', 'x'.repeat(201), ' '.repeat(201) + 'ok'])
      expect((await request(q)).status).toBe(400);
    expect(await results('Absent')).toEqual([]);
  });
  it('does not expose a booking on a deleted account', async () => {
    seed('Muster', 'hidden', '2026-09-02T00:00:00Z');
    db.insert(schema.booking)
      .values({
        id: 'live-booking',
        accountId: 'hidden',
        date: '2026-09-01',
        amountCents: -100,
        memo: 'Muster',
      })
      .run();
    expect(await results('Muster')).toEqual([]);
  });
});
