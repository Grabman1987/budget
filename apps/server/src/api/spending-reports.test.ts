/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers are inspected, not typed */
import {
  budget,
  categories,
  createBooking,
  createTestDatabase,
  type Db,
  type OpenedDatabase,
} from '@budget/db';
import { referenceModel } from '@budget/fixtures';
import { seedDatabase } from '@budget/fixtures/seed';
import type { Hono } from 'hono';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';

function api(db: Db, today: string): Hono {
  return createLedgerApi({ db, today: () => today, stepUp: async (_c, next) => next() });
}
async function get(app: Hono, path: string) {
  const response = await app.request(path);
  return { status: response.status, body: (await response.json()) as any };
}

describe('2.1 Ausgabenanalyse on a small ledger', () => {
  let opened: OpenedDatabase;
  let app: Hono;
  beforeEach(() => {
    opened = createTestDatabase();
    seedBasics(opened.db);
    // Future class and income-like categories must never become consumption.
    categories.create(
      opened.db,
      { id: 'sparplan', name: 'Sparplan', groupId: 'g', class: 'future', kind: 'saving' },
      { actor: 'test' },
    );
    app = api(opened.db, '2026-09-17');
  });
  afterEach(() => opened.close());

  function spend(date: string, categoryId: string, cents: number, id?: string) {
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date,
        amountCents: -cents,
        ...(id ? { id } : {}),
        splits: [{ categoryId, amountCents: -cents }],
      },
      { actor: 'test' },
    );
  }

  it('sums Bedarf and Wunsch as consumption, keeps Zukunft apart and nets refunds', async () => {
    spend('2026-08-03', 'miete', 60_000);
    spend('2026-08-10', 'essen', 20_000);
    spend('2026-08-12', 'reise', 15_000);
    spend('2026-08-20', 'sparplan', 40_000);
    // A refund in Essen lowers the category.
    createBooking(
      opened.db,
      {
        accountId: 'giro',
        date: '2026-08-21',
        amountCents: 2_500,
        splits: [{ categoryId: 'essen', amountCents: 2_500 }],
      },
      { actor: 'test' },
    );
    const { status, body } = await get(app, '/reports/spending/analysis?period=1M');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      period: '1M',
      from: '2026-08-01',
      to: '2026-08-31',
      needCents: 60_000 + 17_500,
      wantCents: 15_000,
      futureCents: 40_000,
      consumptionCents: 92_500,
      averagePerMonthCents: 92_500,
    });
    expect(body.rows.map((r: any) => [r.id, r.cents])).toEqual([
      ['miete', 60_000],
      ['essen', 17_500],
      ['reise', 15_000],
    ]);
    const { need, want, future } = body.classShares;
    expect(need + want + future).toBe(100);
    // Same envelope activity as Plan and Heute.
    const august = budget(opened.db, ['2026-08'])[0]!;
    expect(-august.envelopes['essen']!.activityCents).toBe(17_500);
  });

  it('has no previous window when the ledger is too short and says so honestly', async () => {
    spend('2026-08-03', 'miete', 60_000);
    const { body } = await get(app, '/reports/spending/analysis?period=1J');
    expect(body.availableFrom).toBe('2023-10-01');
    expect(body.previousFrom).not.toBeNull(); // 12 + 12 months exist since 2023-10
    const all = (await get(app, '/reports/spending/analysis?period=Alles')).body;
    expect(all.previousFrom).toBeNull();
    expect(all.changeCents).toBeNull();
    expect(all.moves).toEqual([]);
  });

  it('is empty before any budget account exists and rejects unknown periods', async () => {
    const empty = createTestDatabase();
    const response = await get(api(empty.db, '2026-09-17'), '/reports/spending/analysis');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      from: null,
      to: null,
      consumptionCents: 0,
      rows: [],
      availableMonths: 0,
    });
    empty.close();
    expect((await get(app, '/reports/spending/analysis?period=5J')).status).toBe(400);
  });

  it('never writes', async () => {
    spend('2026-08-03', 'miete', 60_000);
    const count = () =>
      opened.sqlite.prepare('select count(*) n from audit_log').get() as { n: number };
    const before = count().n;
    await get(app, '/reports/spending/analysis?period=Alles');
    expect(count().n).toBe(before);
  });
});

describe('2.1 Ausgabenanalyse on the sample ledger', () => {
  let db: Db;
  let app: Hono;
  beforeAll(() => {
    db = createTestDatabase().db;
    seedDatabase(db);
    app = api(db, '2026-09-17');
  });

  it('reproduces the prototype consumption of August 2026 and of the last 12 months', async () => {
    const ref = referenceModel();
    const august = (await get(app, '/reports/spending/analysis?period=1M')).body;
    expect(
      Math.abs(august.consumptionCents - Math.round(ref.consumptionOf(34) * 100)),
    ).toBeLessThanOrEqual(2);
    const year = (await get(app, '/reports/spending/analysis?period=1J')).body;
    expect(year.months).toHaveLength(12);
    expect(year.months[11]).toBe('2026-08');
    const expected = Array.from({ length: 12 }, (_, i) => ref.consumptionOf(23 + i)).reduce(
      (a, b) => a + b,
      0,
    );
    expect(Math.abs(year.consumptionCents - Math.round(expected * 100))).toBeLessThanOrEqual(30);
    expect(year.needCents + year.wantCents).toBe(year.consumptionCents);
    expect(year.previousFrom).toBe('2024-09-01');
    expect(year.heatMonths).toEqual(year.months);
    // Row totals of the heatmap are the category figures of the list.
    for (const row of year.heatRows)
      expect(row.totalCents).toBe(year.rows.find((r: any) => r.id === row.id).cents);
  });
});
