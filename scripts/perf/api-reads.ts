// Synthetic-only, offline handler benchmark. Bundle this file before and after an optimization;
// --compare checks the literal response bytes, including preview tokens, against --capture.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { performance, PerformanceObserver } from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';
import { migrateDatabase, openDatabase } from '@budget/db';
import { Hono } from 'hono';
import { createLedgerApi } from '../../apps/server/src/api/index';
import { FIXTURE_DAY, openApiReadFixture, seedApiReadFixture } from './api-read-fixture';

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const selected = option('--database');
assert(selected, '--database <disposable synthetic SQLite path> is required');
const file = resolve(selected);
if (args.includes('--create')) {
  assert(!existsSync(file), 'Refusing to overwrite an existing database');
  mkdirSync(dirname(file), { recursive: true });
  const opened = openDatabase(file);
  migrateDatabase(opened.db);
  console.log(JSON.stringify(seedApiReadFixture(opened.db)));
  opened.close();
  process.exit(0);
}
assert(existsSync(file), 'Create the synthetic fixture first with --create');
const { db, sqlite } = openApiReadFixture(file);
const datasetSha256 = crypto.createHash('sha256').update(sqlite.serialize()).digest('hex');
const gc = { count: 0, totalMs: 0, maxMs: 0 };
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    gc.count++;
    gc.totalMs += entry.duration;
    gc.maxMs = Math.max(gc.maxMs, entry.duration);
  }
});
observer.observe({ entryTypes: ['gc'] });

// The real token includes a per-process restart epoch. Pin only that random input in
// this disposable benchmark process so an exact comparison never strips API fields.
crypto.randomUUID = () => '00000000-0000-4000-8000-000000000956';
syncBuiltinESMExports();
const paths = [
  '/budget/2026-09?previewBasis=1',
  '/budget/months?months=2026-08,2026-09&previewBasis=1',
  '/accounts',
  '/payslip-intake/status',
  '/reports/spending/inflation',
  '/sources/crypto',
  '/inbox/count',
  '/market/status',
  '/profile',
  // Optional diagnostic sources of contention, separate from the requested reads.
  ...(args.includes('--include-extras')
    ? [
        '/portfolio/positions',
        '/heute?period=month&month=2026-09',
        '/heute?period=payday&month=2026-09',
        '/accounts/series?from=2026-08-18&to=2026-09-17&quality=1',
        '/liquidity',
      ]
    : []),
];
const ledgerApi = () =>
  createLedgerApi({
    db,
    today: () => FIXTURE_DAY,
    bankSync: null,
    stepUp: async (_c, next) => next(),
  });
const app = () => new Hono().route('/api', ledgerApi());
const capture = option('--capture');
const compare = option('--compare');
const samples = Number(option('--samples') ?? 5);
assert(Number.isInteger(samples) && samples > 0 && samples <= 100, '--samples must be 1..100');
const median = (sorted: number[]) =>
  sorted.length % 2
    ? sorted[Math.floor(sorted.length / 2)]!
    : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
assert(!(capture && compare), 'Capture and compare must be separate runs');
if (compare) {
  const manifest = JSON.parse(readFileSync(join(compare, 'manifest.json'), 'utf8')) as {
    datasetSha256: string;
    paths: string[];
  };
  assert.equal(
    manifest.datasetSha256,
    datasetSha256,
    'Comparison requires the identical synthetic database',
  );
  assert.deepEqual(manifest.paths, paths);
}
const sqlStats = new Map<string, { count: number; ms: number }>();
if (args.includes('--profile-sql')) {
  const prepare = sqlite.prepare.bind(sqlite);
  sqlite.prepare = ((sql: string) => {
    const statement = prepare(sql);
    const target = statement as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const method of ['all', 'get', 'run']) {
      const original = target[method]!.bind(statement);
      target[method] = (...params: unknown[]) => {
        const start = performance.now();
        try {
          return original(...params);
        } finally {
          const key = sql.replace(/\s+/g, ' ');
          const stat = sqlStats.get(key) ?? { count: 0, ms: 0 };
          stat.count++;
          stat.ms += performance.now() - start;
          sqlStats.set(key, stat);
        }
      };
    }
    return statement;
  }) as typeof sqlite.prepare;
}
if (capture) mkdirSync(capture, { recursive: true });
if (capture)
  writeFileSync(
    join(capture, 'manifest.json'),
    JSON.stringify({ datasetSha256, paths, today: FIXTURE_DAY }),
  );
const results: unknown[] = [];
const writesBefore = (sqlite.prepare('select total_changes() n').get() as { n: number }).n;
for (const [index, path] of paths.entries()) {
  if (option('--only') && !path.includes(option('--only')!)) continue;
  const timings: number[] = [];
  const cpuMs: number[] = [];
  let bytes = 0;
  let hash = '';
  for (let sample = 0; sample < samples; sample++) {
    sqlStats.clear();
    const handler = app(); // Cold response cache for every sample, not a cache-hit benchmark.
    // HTTP requests arrive on separate turns. Allow prior streams/GC/observers to settle;
    // constructing the route tree is server setup, outside the timed handler window.
    await new Promise<void>((done) => setImmediate(done));
    const cpu = process.cpuUsage();
    const start = performance.now();
    const response = await handler.request(`/api${path}`);
    const body = Buffer.from(await response.arrayBuffer());
    timings.push(performance.now() - start);
    const used = process.cpuUsage(cpu);
    cpuMs.push((used.user + used.system) / 1000);
    assert.equal(response.status, 200, path);
    bytes = body.length;
    hash = crypto.createHash('sha256').update(body).digest('hex');
    const name = `${index}.body`;
    if (capture && sample === 0) writeFileSync(join(capture, name), body);
    if (compare) assert.deepEqual(body, readFileSync(join(compare, name)), path);
    if (args.includes('--verbose'))
      console.error(
        JSON.stringify({ path, sample, cpu: process.cpuUsage(cpu), memory: process.memoryUsage() }),
      );
    await new Promise<void>((done) => setImmediate(done));
  }
  timings.sort((a, b) => a - b);
  const result = {
    path,
    timings,
    medianMs: median(timings),
    cpuMs,
    bytes,
    hash,
    ...(args.includes('--profile-sql') && {
      sql: [...sqlStats.entries()].sort((a, b) => b[1].ms - a[1].ms),
    }),
  };
  results.push(result);
  console.error(JSON.stringify(result));
}
if (args.includes('--reference-card')) {
  const timings: number[] = [];
  let bytes = 0;
  for (let sample = 0; sample < samples; sample++) {
    const handler = app();
    await new Promise<void>((done) => setImmediate(done));
    const start = performance.now();
    const response = await handler.request('/api/inflation-basket/reference');
    const body = Buffer.from(await response.arrayBuffer());
    timings.push(performance.now() - start);
    bytes = body.length;
    assert.equal(response.status, 200);
    if (compare) {
      const old = JSON.parse(readFileSync(join(compare, '4.body'), 'utf8')) as {
        reference: unknown;
      };
      assert.deepEqual(body, Buffer.from(JSON.stringify({ reference: old.reference })));
    }
    await new Promise<void>((done) => setImmediate(done));
  }
  timings.sort((a, b) => a - b);
  results.push({
    path: '/inflation-basket/reference',
    timings,
    medianMs: median(timings),
    bytes,
  });
}
const burstPaths = args.includes('--settings-burst')
  ? [
      paths[0]!,
      '/accounts',
      '/payslip-intake/status',
      '/sources/crypto',
      '/inbox/count',
      '/market/status',
      args.includes('--reference-card')
        ? '/inflation-basket/reference'
        : '/reports/spending/inflation',
    ]
  : paths;
// A fresh cache for the burst too; the reference timing above must not warm it.
const burstHandler = app();
const queuedAt = performance.now();
const heartbeat = new Promise<number>((done) =>
  setImmediate(() => done(performance.now() - queuedAt)),
);
const completions = await Promise.all(
  burstPaths
    .filter((path) => !option('--only') || path.includes(option('--only')!))
    .map(async (path) => {
      const response = await burstHandler.request(`/api${path}`);
      assert.equal(response.status, 200, path);
      await response.arrayBuffer();
      return { path, elapsedMs: performance.now() - queuedAt };
    }),
);
const burstMs = performance.now() - queuedAt;
const eventLoopBlockedMs = await heartbeat;
let startup: { warmed: number; totalMs: number; readyIoMs: number } | undefined;
if (args.includes('--startup')) {
  const warm = ledgerApi();
  const start = performance.now();
  const readyIo = new Promise<number>((done) =>
    setImmediate(() => done(performance.now() - start)),
  );
  const warmed = await warm.warm();
  assert.equal(warmed, 2);
  startup = { warmed, totalMs: performance.now() - start, readyIoMs: await readyIo };
}
// GC records are delivered after the current turn, not during synchronous handlers.
await new Promise<void>((done) => setImmediate(done));
for (const entry of observer.takeRecords()) {
  gc.count++;
  gc.totalMs += entry.duration;
  gc.maxMs = Math.max(gc.maxMs, entry.duration);
}
assert.equal(
  (sqlite.prepare('select total_changes() n').get() as { n: number }).n,
  writesBefore,
  'Reads must not write',
);
console.log(
  JSON.stringify({
    protocol: 'api-read-956-v1',
    today: FIXTURE_DAY,
    runtime: process.version,
    samplesPerRoute: samples,
    counts: Object.fromEntries(
      ['account', 'booking', 'trade', 'inbox_item', 'market_run'].map((table) => [
        table,
        (sqlite.prepare(`select count(*) n from ${table}`).get() as { n: number }).n,
      ]),
    ),
    results,
    datasetSha256,
    burstPaths,
    completions,
    burstMs,
    eventLoopBlockedMs,
    gc,
    startup,
    limits: Object.fromEntries(
      ['cpu.max', 'cpu.stat', 'memory.max', 'memory.swap.max', 'memory.events']
        .filter((name) => existsSync(`/sys/fs/cgroup/${name}`))
        .map((name) => [name, readFileSync(`/sys/fs/cgroup/${name}`, 'utf8').trim()]),
    ),
    memory: process.memoryUsage(),
    peakRssKiB: process.resourceUsage().maxRSS,
    heapLimit: getHeapStatistics().heap_size_limit,
  }),
);
observer.disconnect();
sqlite.close();
