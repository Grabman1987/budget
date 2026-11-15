// Synthetic-only benchmark for GET /api/heute and GET /api/portfolio/positions (#956).
//   npx tsx scripts/perf/heute-positions-956.ts --database data/heute-956.sqlite --create
//   npx tsx scripts/perf/heute-positions-956.ts --database data/heute-956.sqlite [--samples 9]
//     [--capture digests.json | --compare digests.json]
// Prints, per route, the own server time (fresh read-model cache each sample), statement count and
// SQL time, then the Heute page burst: the page's reads queued on one Node thread, as in production.
// CPU profile of one route: node --cpu-prof --import tsx scripts/perf/heute-positions-956.ts
//   --database ... --only heute, then node scripts/perf/profile-summary.mjs <file>.cpuprofile 30
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { migrateDatabase, openDatabase } from '@budget/db';
import { Hono } from 'hono';
import { createLedgerApi } from '../../apps/server/src/api/index';
import { FIXTURE_DAY } from './api-read-fixture';
import { HEUTE_FIXTURE_KEY, HEUTE_FIXTURE_VALUE, seedHeuteFixture } from './heute-fixture-956';

export const HEUTE_956_ROUTES = [
  '/heute?period=month',
  '/heute?period=payday',
  '/heute?period=month&month=2026-08',
  '/portfolio/positions',
  '/portfolio/positions?asOf=2025-12-31',
  '/portfolio?period=1J',
  '/portfolio/depots',
  '/portfolio/costs-taxes',
  '/overview/whole-picture?period=1J',
  '/overview/whole-picture?period=Alles',
  '/wealth/networth?period=Alles',
  '/networth-history',
  '/accounts/series?from=2026-08-18&to=2026-09-17&quality=1',
  '/accounts/reminders',
  '/inbox/count',
];
const BURST = [
  '/heute?period=month&month=2026-09',
  '/budget/2026-09',
  '/expected',
  '/accounts',
  '/goals?month=2026-09',
  '/savings-plans/execution-proposals',
  '/liquidity',
  '/inbox/count',
  '/profile',
];

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const file = resolve(option('--database') ?? assert.fail('--database <synthetic path> required'));
if (args.includes('--create')) {
  assert(!existsSync(file), 'Refusing to overwrite an existing database');
  const opened = openDatabase(file);
  migrateDatabase(opened.db);
  console.log(JSON.stringify(seedHeuteFixture(opened.db)));
  opened.close();
  process.exit(0);
}
const { db, sqlite } = openDatabase(file);
const marker = sqlite.prepare('select value from app_setting where id = ?').get(HEUTE_FIXTURE_KEY);
assert.equal(
  (marker as { value?: string } | undefined)?.value,
  HEUTE_FIXTURE_VALUE,
  'Not synthetic',
);
// Preview tokens carry a per-process epoch; pin only that input so digests are comparable.
crypto.randomUUID = () => '00000000-0000-4000-8000-000000000956';
syncBuiltinESMExports();

const stats = { count: 0, ms: 0 };
const prepare = sqlite.prepare.bind(sqlite);
sqlite.prepare = ((sql: string) => {
  const statement = prepare(sql);
  const target = statement as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const method of ['all', 'get', 'run', 'iterate']) {
    const original = target[method]!.bind(statement);
    target[method] = (...params: unknown[]) => {
      const start = performance.now();
      try {
        return original(...params);
      } finally {
        stats.count++;
        stats.ms += performance.now() - start;
      }
    };
  }
  return statement;
}) as typeof sqlite.prepare;

const app = () =>
  new Hono().route(
    '/api',
    createLedgerApi({ db, today: () => FIXTURE_DAY, bankSync: null, stepUp: async (_c, n) => n() }),
  );
const samples = Number(option('--samples') ?? 5);
const digests: Record<string, string> = {};
for (const path of HEUTE_956_ROUTES) {
  if (option('--only') && !path.includes(option('--only')!)) continue;
  const times: number[] = [];
  let digest = '';
  for (let s = 0; s < samples; s++) {
    const handler = app(); // fresh read-model cache: a miss, as after any write
    await new Promise((done) => setImmediate(done));
    stats.count = 0;
    stats.ms = 0;
    const start = performance.now();
    const response = await handler.request(`/api${path}`);
    const body = Buffer.from(await response.arrayBuffer());
    times.push(performance.now() - start);
    assert.equal(response.status, 200, path);
    digest = `${body.length}:${crypto.createHash('sha256').update(body).digest('hex')}`;
  }
  digests[path] = digest;
  times.sort((a, b) => a - b);
  console.log(
    `${path.padEnd(58)} median ${times[times.length >> 1]!.toFixed(0).padStart(5)} ms  min ${times[0]!.toFixed(0).padStart(5)} ms  statements ${stats.count}  sql ${stats.ms.toFixed(0)} ms`,
  );
}
const capture = option('--capture');
const compare = option('--compare');
if (capture) writeFileSync(capture, `${JSON.stringify(digests, null, 2)}\n`);
if (compare) {
  const old = JSON.parse(readFileSync(compare, 'utf8')) as Record<string, string>;
  for (const path of Object.keys(digests)) assert.equal(digests[path], old[path], path);
  console.log(`all ${Object.keys(digests).length} response bodies byte-identical`);
}
if (!option('--only')) {
  // One page load: the page and shell reads arrive together; the sidebar asks for positions once
  // the account list has answered. Every handler runs synchronously on the one Node thread.
  const handler = app();
  const t0 = performance.now();
  const done = (path: string) =>
    console.log(`burst ${path.padEnd(52)} answered at ${(performance.now() - t0).toFixed(0)} ms`);
  await Promise.all(
    BURST.map(async (path) => {
      await (await handler.request(`/api${path}`)).arrayBuffer();
      done(path);
      if (path === '/accounts') {
        await (await handler.request('/api/portfolio/positions')).arrayBuffer();
        done('/portfolio/positions (after /accounts)');
      }
    }),
  );
}
sqlite.close();
