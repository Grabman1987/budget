import { createHash } from 'node:crypto';
import type * as Crypto from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { migrateDatabase, openDatabase, type OpenedDatabase } from '@budget/db';
import { FIXTURE_DAY } from '../../../../scripts/perf/api-read-fixture';
import { seedHeuteFixture } from '../../../../scripts/perf/heute-fixture-956';
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

// Digests captured from the stock main API on this synthetic ledger before the read changes.
it.each(baseline.responses)('keeps the stock response bytes of $path', async ({ path, digest }) => {
  const response = await api().request(path);
  expect(response.status).toBe(200);
  const body = Buffer.from(await response.arrayBuffer());
  expect(`${body.length}:${createHash('sha256').update(body).digest('hex')}`).toBe(digest);
});

/** Rows each table returned to one request (a structural budget, independent of machine speed). */
async function rowsRead(path: string) {
  const rows = { price: 0, fxRate: 0, auditReplays: 0 };
  const prepare = opened.sqlite.prepare.bind(opened.sqlite);
  const spy = vi.spyOn(opened.sqlite, 'prepare').mockImplementation(((sql: string) => {
    const statement = prepare(sql);
    const all = statement.all.bind(statement);
    statement.all = ((...params: unknown[]) => {
      const result = all(...params) as unknown[];
      if (/ from "price"/.test(sql)) rows.price += result.length;
      if (/ from "fx_rate"/.test(sql)) rows.fxRate += result.length;
      if (/"before_json" IS NOT NULL AND json_extract/.test(sql)) rows.auditReplays++;
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
  const fxRows = (opened.sqlite.prepare('select count(*) n from fx_rate').get() as { n: number }).n;
  const rows = await rowsRead('/heute?period=month');
  // Before #956: about 243k price rows (two full scans) and 10 full rate reads.
  expect(rows.price).toBeLessThan(5_000);
  expect(rows.fxRate).toBeLessThanOrEqual(fxRows);
  // The account review chronology (audit log replay) once, not again for the inbox count.
  expect(rows.auditReplays).toBe(1);
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
      const expected = baseline.responses.find((r) => r.path === path)!.digest;
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
