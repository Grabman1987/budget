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
import baseline from './heute-positions-956.responses.json';

// Pin the restart epoch of preview tokens at its input; never normalize an API answer.
vi.mock('node:crypto', async (original) => ({
  ...(await original<typeof Crypto>()),
  randomUUID: () => '00000000-0000-4000-8000-000000000956',
}));
vi.setConfig({ testTimeout: 60_000 });

let opened: OpenedDatabase;
let directory: string;
const api = () =>
  createLedgerApi({
    db: opened.db,
    today: () => FIXTURE_DAY,
    bankSync: null,
    stepUp: async (_c, next) => next(),
  });

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'budget-heute-956-'));
  const file = join(directory, 'synthetic.sqlite');
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
