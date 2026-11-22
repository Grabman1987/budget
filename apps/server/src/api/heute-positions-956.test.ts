import { createHash } from 'node:crypto';
import type * as Crypto from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { migrateDatabase, openDatabase, type OpenedDatabase } from '@budget/db';
import { FIXTURE_DAY } from '../../../../scripts/perf/api-read-fixture';
import { seedHeuteFixture } from '../../../../scripts/perf/heute-fixture-956';
import { resetReviewEventCache } from '../../../../packages/db/src/repos/account-review-chronology';
import { resetGoalAuditCache } from '../../../../packages/db/src/repos/goal-lifecycle';
import { createLedgerApi } from './index';
import { readModelOffload } from './read-model-offload';
import baseline from './heute-positions-956.responses.json';

// Pin the restart epoch of preview tokens at its input; never normalize an API answer.
vi.mock('node:crypto', async (original) => ({
  ...(await original<typeof Crypto>()),
  randomUUID: () => '00000000-0000-4000-8000-000000000956',
}));
vi.setConfig({ testTimeout: 60_000 });

let opened: OpenedDatabase;
let directory: string;
let file: string;
const api = () =>
  createLedgerApi({
    db: opened.db,
    today: () => FIXTURE_DAY,
    bankSync: null,
    stepUp: async (_c, next) => next(),
  });

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'budget-heute-956-'));
  file = join(directory, 'synthetic.sqlite');
  const seed = openDatabase(file);
  migrateDatabase(seed.db);
  seedHeuteFixture(seed.db);
  seed.close();
  opened = openDatabase(file);
}, 120_000);
afterAll(() => {
  opened.close();
  rmSync(directory, { recursive: true, force: true });
});

// Non-Heute digests retain the stock read baseline; Heute follows SPEC Financial terms (F2).
it.each(baseline.responses)(
  'keeps the reviewed response bytes of $path',
  async ({ path, digest }) => {
    const response = await api().request(path);
    expect(response.status).toBe(200);
    let body = Buffer.from(await response.arrayBuffer());
    if (path.startsWith('/heute?')) {
      const payload = JSON.parse(body.toString('utf8'));
      // Synthetic cash 4,707,357 minus 241,621 open cents, including 70,000 Zukunft cents.
      expect(payload.lead).toMatchObject({
        balanceCents: 4_707_357,
        openCents: 241_621,
        freeCents: 4_465_736,
        lastResortCents: 600_000,
      });
      expect(payload.lead).not.toHaveProperty('inflowCents');
      expect(payload.lead).not.toHaveProperty('overdraftCents');
      expect(payload.dailyBudget.perDayCents).toBe(159_491);
      // Additions-only proof: remove precisely the new top-level field. Every
      // pre-existing field, value and ordering must match the unchanged main digest.
      expect(payload).toHaveProperty('accountLiquidity');
      delete payload.accountLiquidity;
      body = Buffer.from(JSON.stringify(payload));
    } else if (
      path === '/portfolio?period=1J' ||
      path === '/portfolio/depots' ||
      path.startsWith('/overview/whole-picture?')
    ) {
      const payload = JSON.parse(body.toString('utf8'));
      const report =
        path === '/portfolio?period=1J'
          ? payload.portfolio
          : path === '/portfolio/depots'
            ? payload.depots
            : payload;
      const reconciliation = report.cashReconciliation;
      expect(reconciliation).toMatchObject({
        label: 'Geld unterwegs',
        asOf: report.asOf,
        transitCents: 0,
        missingFxAccountIds: [],
      });
      expect(Number.isSafeInteger(reconciliation.rawCashCents)).toBe(true);
      expect(reconciliation.cashIncludingTransitCents).toBe(reconciliation.rawCashCents);
      // #1195 adds this read-only bridge. Retain the original digest for all other bytes.
      delete report.cashReconciliation;
      body = Buffer.from(JSON.stringify(payload));
    }
    expect(`${body.length}:${createHash('sha256').update(body).digest('hex')}`).toBe(digest);
  },
);

/** Rows each table returned to one request (a structural budget, independent of machine speed). */
async function rowsRead(path: string) {
  const rows = { price: 0, priceScans: 0, fxRate: 0, auditReplays: 0, auditRows: 0, statements: 0 };
  const prepare = opened.sqlite.prepare.bind(opened.sqlite);
  const spy = vi.spyOn(opened.sqlite, 'prepare').mockImplementation(((sql: string) => {
    const statement = prepare(sql);
    const get = statement.get.bind(statement);
    statement.get = ((...params: unknown[]) => {
      rows.statements++;
      return get(...params);
    }) as typeof statement.get;
    const all = statement.all.bind(statement);
    statement.all = ((...params: unknown[]) => {
      rows.statements++;
      const result = all(...params) as unknown[];
      if (/ (?:from|join) "price"/.test(sql)) {
        rows.price += result.length;
        const plan = prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as { detail: string }[];
        rows.priceScans += plan.filter(({ detail }) => /^SCAN price\b/.test(detail)).length;
      }
      if (/ from "fx_rate"/.test(sql)) rows.fxRate += result.length;
      if (/"before_json" IS NOT NULL AND json_extract/.test(sql)) {
        rows.auditReplays++;
        rows.auditRows += result.length;
      }
      return result;
    }) as typeof statement.all;
    return statement;
  }) as typeof opened.sqlite.prepare);
  try {
    const response = await api().request(path);
    expect(response.status).toBe(200);
    await response.arrayBuffer();
  } finally {
    spy.mockRestore();
  }
  return rows;
}

it('reads the price and rate history at most once per Heute request', async () => {
  // Earlier digest reads warm connection-local audit caches; this budget measures a cold read.
  resetReviewEventCache(opened.db);
  resetGoalAuditCache(opened.db);
  const fxRows = (opened.sqlite.prepare('select count(*) n from fx_rate').get() as { n: number }).n;
  const rows = await rowsRead('/heute?period=month');
  // Before #956: about 243k price rows (two full scans) and 10 full rate reads.
  expect(rows.price).toBeLessThan(5_000);
  expect(rows.priceScans).toBe(0);
  expect(rows.fxRate).toBeLessThanOrEqual(fxRows);
  // The account review chronology (audit log replay) once, not again for the inbox count.
  expect(rows.auditReplays).toBe(1);
  // #1073: the direct primitive projection must not widen the eligible audit read.
  expect(rows.auditRows).toBeGreaterThan(10_000);
  expect(rows.auditRows).toBeLessThanOrEqual(15_000);
  // #1073: batch the indexed latest quotes instead of one statement per held security/day.
  expect(rows.statements).toBeLessThanOrEqual(900);
});

it('finds the latest quotes for positions without reading the price history', async () => {
  const rows = await rowsRead('/portfolio/positions');
  expect(rows.price).toBeLessThan(1_000);
});

const digestOf = (body: Buffer) =>
  `${body.length}:${createHash('sha256').update(body).digest('hex')}`;

it('answers Heute from the read-model worker with the same bytes and never stale after a write', async () => {
  const offload = readModelOffload(file, () => FIXTURE_DAY);
  try {
    const cached = createLedgerApi({
      db: opened.db,
      today: () => FIXTURE_DAY,
      bankSync: null,
      stepUp: async (_c, next) => next(),
      offload,
    });
    const read = async (path: string) => {
      const response = await cached.request(path);
      expect(response.status).toBe(200);
      return Buffer.from(await response.arrayBuffer());
    };
    for (const path of ['/heute?period=month', '/heute?period=payday']) {
      // The tests above pin direct response bytes. This test independently proves
      // the worker/cache returns those exact bytes, including additive API fields.
      const direct = await api().request(path);
      expect(direct.status).toBe(200);
      const expected = digestOf(Buffer.from(await direct.arrayBuffer()));
      // Two concurrent cold requests share one computation; the repeat comes from the cache.
      const [a, b] = await Promise.all([read(path), read(path)]);
      expect(digestOf(a)).toBe(expected);
      expect(digestOf(b)).toBe(expected);
      expect(digestOf(await read(path))).toBe(expected);
      expect(offload.recent(0)).toContain(path);
    }
    // One worker computation per period: the concurrent twin and the repeat did not compute.
    expect(offload.served()).toBe(2);

    // A write on the server's connection and one of another connection (bank worker, Litestream)
    // both move the stamp: the next answer is computed on the new state, equal to a fresh
    // server-thread computation.
    const writers = [opened.sqlite, openDatabase(file).sqlite];
    try {
      for (const [i, writer] of writers.entries()) {
        const before = await read('/heute?period=month');
        writer
          .prepare(
            `update account set opening_balance_cents = opening_balance_cents + ?
             where id = (select id from account where on_budget = 1 and role = 'budget'
                         and deleted_at is null order by id limit 1)`,
          )
          .run(1_000 * (i + 1));
        const after = await read('/heute?period=month');
        expect(after.equals(before)).toBe(false);
        const fresh = Buffer.from(await (await api().request('/heute?period=month')).arrayBuffer());
        expect(after.equals(fresh)).toBe(true);
      }
      expect(offload.served()).toBe(4);
    } finally {
      writers[0]!
        .prepare(
          `update account set opening_balance_cents = opening_balance_cents - 3000
         where id = (select id from account where on_budget = 1 and role = 'budget'
                     and deleted_at is null order by id limit 1)`,
        )
        .run();
      writers[1]!.close();
    }
  } finally {
    await offload.close();
  }
});
