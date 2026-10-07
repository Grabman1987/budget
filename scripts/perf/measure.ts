import { migrateDatabase, openDatabase } from '@budget/db';
import { createLedgerApi } from '../../apps/server/src/api/index';
import { Hono } from 'hono';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dbPath = process.env['DATABASE_PATH']!;
const { db, sqlite } = openDatabase(dbPath);
if (process.env['MIGRATE'] !== '0') migrateDatabase(db, process.env['BUDGET_MIGRATIONS_DIR']!);

// statement instrumentation
const stats = { count: 0, ms: 0, sqls: new Map<string, { n: number; ms: number }>() };
const origPrepare = sqlite.prepare.bind(sqlite);
(sqlite as any).prepare = (sql: string) => {
  const st = origPrepare(sql);
  for (const m of ['all', 'get', 'run', 'iterate', 'values']) {
    const f = (st as any)[m]?.bind(st);
    if (!f) continue;
    (st as any)[m] = (...a: unknown[]) => {
      const t = performance.now();
      try {
        return f(...a);
      } finally {
        const d = performance.now() - t;
        stats.count++;
        stats.ms += d;
        const k = sql.slice(0, 300);
        const e = stats.sqls.get(k) ?? { n: 0, ms: 0 };
        e.n++;
        e.ms += d;
        stats.sqls.set(k, e);
      }
    };
  }
  return st;
};

sqlite.exec('create temp table if not exists perf_tick (n integer)');
const api = createLedgerApi({ db, stepUp: async (_c, n) => n(), bankSync: null } as any);
const app = new Hono().route('/api', api);

const routes: string[] = (process.env['ROUTES'] ? process.env['ROUTES'].split('\n') : []).filter(
  Boolean,
);
const only = process.env['ONLY'];
const results: any[] = [];
for (const r of routes) {
  if (only && !r.includes(only)) continue;
  const times: number[] = [];
  let hash = '',
    size = 0,
    status = 0,
    q = 0,
    qms = 0;
  const reps = Number(process.env['REPS'] ?? 4);
  for (let i = 0; i < reps; i++) {
    stats.count = 0;
    stats.ms = 0;
    stats.sqls.clear();
    // A write moves the database stamp, so the read-model cache cannot answer (cold compute every rep).
    sqlite.exec('insert into perf_tick values (1)');
    const t = performance.now();
    const res = await app.request('/api' + r);
    const text = await res.text();
    if (i === 0 && text.length < 1500) console.log(text.slice(0, 200));
    times.push(performance.now() - t);
    size = text.length;
    hash = createHash('sha1').update(text).digest('hex').slice(0, 10);
    status = res.status;
    q = stats.count;
    qms = stats.ms;
  }
  const cold = times[0]!;
  const warm = [...times.slice(1)].sort((a, b) => a - b);
  const top = [...stats.sqls.entries()]
    .sort((a, b) => b[1].ms - a[1].ms)
    .slice(0, Number(process.env['TOPN'] ?? 3));
  results.push({
    r,
    hash,
    status,
    cold: Math.round(cold),
    p50: Math.round(warm[Math.floor(warm.length / 2)]!),
    kb: Math.round(size / 1024),
    q,
    qms: Math.round(qms),
    top: top.map(
      ([s, v]) => `${v.n}x ${v.ms.toFixed(0)}ms ${s.replace(/\s+/g, ' ').slice(0, 160)}`,
    ),
  });
  console.log(
    `${String(status)} cold=${Math.round(cold)} p50=${results.at(-1).p50} ${results.at(-1).kb}kB q=${q}/${Math.round(qms)}ms ${r}`,
  );
}
writeFileSync(process.env['OUT'] ?? 'perf-out.json', JSON.stringify(results, null, 1));
