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

const TODAY = '2026-10-20';
const webDir = mkdtempSync(join(tmpdir(), 'budget-suggest-'));
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
  for (const month of ['2026-07', '2026-08', '2026-09'])
    createBooking(
      db,
      {
        accountId: 'giro',
        date: `${month}-03`,
        amountCents: -85_000,
        payeeId: 'p1',
        source: 'manual',
        status: 'confirmed',
        splits: [{ amountCents: -85_000, categoryId: 'miete' }],
      },
      ctx,
    );
  app = createApp({ webDir, auth: signedIn, ledger: { db, today: () => TODAY } });
});

async function call(method: string, path: string) {
  const res = await app.request(`/api${path}`, { method });
  return { status: res.status, body: (await res.json()) as any };
}

describe('recurring suggestions API', () => {
  it('lists, accepts into an expected payment and then offers nothing', async () => {
    const list = await call('GET', '/expected/suggestions');
    expect(list.status).toBe(200);
    expect(list.body.suggestions).toHaveLength(1);
    expect(list.body.suggestions[0]).toMatchObject({
      name: 'Vermieter',
      rhythm: 'monthly',
      amountCents: 85_000,
    });
    // Detection alone writes nothing.
    expect((await call('GET', '/expected')).body.payments).toHaveLength(0);
    const id = list.body.suggestions[0].id;
    const accepted = await call('POST', `/expected/suggestions/${id}/accept`);
    expect(accepted.status).toBe(201);
    expect((await call('GET', '/expected')).body.payments).toHaveLength(1);
    expect((await call('GET', '/expected/suggestions')).body.suggestions).toHaveLength(0);
    expect((await call('POST', `/expected/suggestions/${id}/accept`)).status).toBe(409);
  });

  it('remembers a dismissal', async () => {
    const id = (await call('GET', '/expected/suggestions')).body.suggestions[0].id;
    expect((await call('POST', `/expected/suggestions/${id}/dismiss`)).status).toBe(200);
    expect((await call('GET', '/expected/suggestions')).body.suggestions).toHaveLength(0);
    expect((await call('GET', '/expected')).body.payments).toHaveLength(0);
  });
});
