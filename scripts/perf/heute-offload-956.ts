// Synthetic-only measurement of GET /api/heute computed in the read-model worker (#956).
//   npx tsx scripts/perf/heute-offload-956.ts --database data/heute-956.sqlite [--samples 7]
// Prints cold (fresh read-model cache) and warm times of Heute and the Plan month, the latency of
// a trivial read (/profile) while a cold Heute computes, and checks that the offloaded Heute body
// is byte-identical to the one computed on the server thread.
import assert from 'node:assert/strict';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { openDatabase } from '@budget/db';
import { createLedgerApi } from '../../apps/server/src/api/index';
import { readModelOffload } from '../../apps/server/src/api/read-model-offload';
import { FIXTURE_DAY } from './api-read-fixture';
import { HEUTE_FIXTURE_KEY, HEUTE_FIXTURE_VALUE } from './heute-fixture-956';

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const file = resolve(option('--database') ?? assert.fail('--database <synthetic path> required'));
const samples = Number(option('--samples') ?? 7);
const { db, sqlite } = openDatabase(file);
const marker = sqlite.prepare('select value from app_setting where id = ?').get(HEUTE_FIXTURE_KEY);
assert.equal(
  (marker as { value?: string } | undefined)?.value,
  HEUTE_FIXTURE_VALUE,
  'Not synthetic',
);

const today = () => FIXTURE_DAY;
const offload = readModelOffload(file, today);
const api = (withWorker: boolean) =>
  createLedgerApi({
    db,
    today,
    bankSync: null,
    stepUp: async (_c, n) => n(),
    ...(withWorker ? { offload } : {}),
  });
const timed = async (handler: ReturnType<typeof api>, path: string) => {
  const start = performance.now();
  const response = await handler.request(path);
  const body = await response.text();
  assert.equal(response.status, 200, path);
  return { ms: performance.now() - start, body };
};
const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return `median ${sorted[sorted.length >> 1]!.toFixed(0).padStart(5)} ms  min ${sorted[0]!.toFixed(0).padStart(5)} ms`;
};

const HEUTE = '/heute?period=month&month=2026-09';
const inline = (await timed(api(false), HEUTE)).body;
await timed(api(true), HEUTE); // starts the worker
for (const [label, withWorker, path] of [
  ['Heute, server thread', false, HEUTE],
  ['Heute, worker', true, HEUTE],
  ['Plan month', false, '/budget/2026-09?previewBasis=1'],
] as const) {
  const cold: number[] = [];
  const warm: number[] = [];
  for (let s = 0; s < samples; s++) {
    const handler = api(withWorker); // fresh read-model cache: a miss, as after any write
    const first = await timed(handler, path);
    if (path === HEUTE) assert.equal(first.body, inline, 'Heute body differs');
    cold.push(first.ms);
    warm.push((await timed(handler, path)).ms);
  }
  console.log(`${label.padEnd(22)} cold ${stats(cold)}   warm ${stats(warm)}`);
}

// Other requests while a cold Heute computes: /profile is asked every 25 ms from the moment Heute
// is asked; its latency counts from the moment it was due, so time spent queued behind Heute counts.
for (const withWorker of [false, true]) {
  const handler = api(withWorker);
  const loop = monitorEventLoopDelay({ resolution: 5 });
  loop.enable();
  const started = performance.now();
  const others: Promise<number>[] = [];
  const timer = setInterval(() => {
    // Measured from when it was due: a callback held back by a synchronous Heute counts that wait.
    const due = started + 25 * (others.length + 1);
    others.push(
      Promise.resolve(handler.request('/profile'))
        .then((r) => r.arrayBuffer())
        .then(() => performance.now() - due),
    );
  }, 25);
  await new Promise((r) => setTimeout(r, 30));
  const heute = handler.request(HEUTE);
  await (await heute).arrayBuffer();
  const total = performance.now() - started;
  await new Promise((r) => setTimeout(r, 60)); // let a held-back callback run and be counted
  clearInterval(timer);
  const late = await Promise.all(others);
  loop.disable();
  console.log(
    `${withWorker ? 'worker' : 'server thread'}: Heute ${total.toFixed(0)} ms, /profile while computing: n=${late.length} max ${Math.max(0, ...late).toFixed(0)} ms, longest event-loop stall ${(loop.max / 1e6).toFixed(0)} ms`,
  );
}
console.log('offloaded Heute byte-identical to the server-thread answer');
await offload.close();
sqlite.close();
