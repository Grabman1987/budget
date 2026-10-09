import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { openDatabase, sqliteOf } from '@budget/db';
import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { createLedgerApi } from '../../apps/server/src/api/index';

const SAMPLES_PER_STATE = 10;
const EXPECTED_WARM_MODELS = 2;
const ALL_ROUTES = [
  '/heute?period=month&month=2026-09',
  '/heute?period=payday&month=2026-09',
] as const;
const PAYDAY_ROUTE = '/heute?period=payday&month=2026-09' as const;
const profileEnabled = process.argv.slice(2).includes('--profile');
const ROUTES = profileEnabled ? ([PAYDAY_ROUTE] as const) : ALL_ROUTES;
const PLANNED_SAMPLES = ROUTES.length * 2 * SAMPLES_PER_STATE;

type State = 'cold' | 'warm';
type Sample = {
  state: State;
  route: string;
  index: number;
  complete: boolean;
  setupMs?: number;
  warmupMs?: number;
  requestMs?: number;
  status?: number;
  bytes?: number;
  responseSha256?: string;
  processCpuUs?: { user: number; system: number };
  sql?: SqlProfile;
  error?: string;
};

type SqlMethodStats = { count: number; totalMs: number };
type SqlProfile = {
  prepare: SqlMethodStats;
  execution: Record<'get' | 'all' | 'run' | 'iterate', SqlMethodStats>;
};

function emptySqlProfile(): SqlProfile {
  const method = (): SqlMethodStats => ({ count: 0, totalMs: 0 });
  return {
    prepare: method(),
    execution: {
      get: method(),
      all: method(),
      run: method(),
      iterate: method(),
    },
  };
}

function addElapsed(stat: SqlMethodStats, start: number): void {
  stat.totalMs += performance.now() - start;
}

function instrumentSqlite(sqlite: ReturnType<typeof sqliteOf>, stats: SqlProfile): void {
  type Method = keyof SqlProfile['execution'];
  type Callable = (...args: unknown[]) => unknown;
  const originalPrepare = sqlite.prepare.bind(sqlite);
  const target = sqlite as unknown as { prepare: Database.Database['prepare'] };
  target.prepare = ((sql: string) => {
    const start = performance.now();
    let statement: Database.Statement;
    try {
      statement = originalPrepare(sql);
    } finally {
      stats.prepare.count++;
      addElapsed(stats.prepare, start);
    }
    const methods = statement as unknown as Record<Method, Callable>;
    for (const method of ['get', 'all', 'run'] as const) {
      const original = methods[method].bind(statement);
      methods[method] = (...args: unknown[]) => {
        const started = performance.now();
        stats.execution[method].count++;
        try {
          return original(...args);
        } finally {
          addElapsed(stats.execution[method], started);
        }
      };
    }
    const iterate = methods.iterate.bind(statement);
    methods.iterate = (...args: unknown[]) => {
      const iterator = iterate(...args) as unknown as IterableIterator<unknown>;
      const next = iterator.next.bind(iterator);
      const iteratorReturn = iterator.return?.bind(iterator);
      const stat = stats.execution.iterate;
      stat.count++;
      const timed = <T>(operation: () => T): T => {
        const started = performance.now();
        try {
          return operation();
        } finally {
          addElapsed(stat, started);
        }
      };
      const wrapped: IterableIterator<unknown> = {
        [Symbol.iterator]() {
          return this;
        },
        next(...nextArgs: [] | [unknown]) {
          return timed(() => next(...nextArgs));
        },
      };
      if (iteratorReturn) {
        wrapped.return = (...returnArgs: [] | [unknown]) =>
          timed(() => iteratorReturn(...returnArgs));
      }
      return wrapped;
    };
    return statement;
  }) as Database.Database['prepare'];
}

const samples: Sample[] = [];
const report: Record<string, unknown> = {
  protocol: profileEnabled ? 'heute-handler-profile-v1' : 'heute-cold-warm-v1',
  profile: profileEnabled,
  fixedToday: '2026-09-17',
  samplesPerState: SAMPLES_PER_STATE,
  plannedSamples: PLANNED_SAMPLES,
  expectedWarmModels: EXPECTED_WARM_MODELS,
  ...(profileEnabled
    ? {
        profileMetrics: {
          processCpuUnit: 'microseconds, user and system separately',
          sqlElapsedUnit: 'milliseconds',
          sqlMethods: ['get', 'all', 'run', 'iterate'],
          sqlPrepareIncluded: true,
          requestWindow: 'app.request plus response.text; setup and warm-up excluded',
        },
      }
    : {}),
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  routes: ROUTES.map((route) => `/api${route}`),
  samples,
};

function selectedDatabasePath(): string {
  const args = process.argv.slice(2);
  const valid =
    (args.length === 2 && args[0] === '--database' && args[1]) ||
    (args.length === 3 && args[0] === '--database' && args[1] && args[2] === '--profile');
  if (!valid || !args[1]) {
    throw new Error(
      'Usage: npx tsx scripts/perf/heute-cold-warm.ts --database <absolute-synthetic-db-path> [--profile]',
    );
  }
  if (!isAbsolute(args[1])) throw new Error('The selected database path must be absolute.');
  if (!existsSync(args[1]) || !statSync(args[1]).isFile())
    throw new Error('The selected database must be an existing file; preparation is separate.');
  return realpathSync(args[1]);
}

function assertAllowedPath(databasePath: string, repositoryRoot: string): void {
  const rel = relative(repositoryRoot, databasePath);
  if (rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))) {
    throw new Error('Refusing a database located inside the repository.');
  }
  if (databasePath.split(/[\\/]+/).some((part) => part.toLowerCase() === 'dropbox')) {
    throw new Error('Refusing a database located under a Dropbox path.');
  }
}

function gitMetadata(repositoryRoot: string) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  return {
    head,
    dirty: status.trim().length > 0,
    dirtyEntryCount: status.trim() ? status.trimEnd().split(/\r?\n/).length : 0,
  };
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function tableCount(sqlite: ReturnType<typeof sqliteOf>, table: string): number {
  return (
    sqlite.prepare(`select count(*) as count from ${quoteIdentifier(table)}`).get() as {
      count: number;
    }
  ).count;
}

function datasetMetadata(sqlite: ReturnType<typeof sqliteOf>, verifyFixture: boolean) {
  const marker = sqlite
    .prepare('select id, name, opening_date from account where id = ?')
    .get('acc-giro') as { id: string; name: string; opening_date: string } | undefined;
  const institution = sqlite
    .prepare('select id, name from institution where id = ?')
    .get('inst-bank-a') as { id: string; name: string } | undefined;
  if (
    verifyFixture &&
    (marker?.id !== 'acc-giro' ||
      marker.name !== 'Girokonto' ||
      marker.opening_date !== '2023-10-01' ||
      institution?.id !== 'inst-bank-a' ||
      institution.name !== 'Bank A')
  ) {
    throw new Error('Synthetic fixture marker missing; refusing an unrecognized database.');
  }
  const auditLogRows = tableCount(sqlite, 'audit_log');
  if (verifyFixture && auditLogRows !== 0) {
    throw new Error(
      'Synthetic fixture audit log is not empty; refusing a database with user changes.',
    );
  }

  const hash = createHash('sha256');
  const tables = sqlite
    .prepare("select name from sqlite_master where type = 'table' order by name")
    .all() as { name: string }[];
  const counts: Record<string, number> = {};
  for (const { name: table } of tables) {
    if (table.toLowerCase().startsWith('sqlite_')) continue;
    const tableIdentifier = quoteIdentifier(table);
    const columns = sqlite.prepare(`pragma table_info(${tableIdentifier})`).all() as {
      name: string;
      pk: number;
    }[];
    const primaryKey = columns
      .filter((column) => column.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((column) => column.name);
    const orderBy = primaryKey.length ? primaryKey.map(quoteIdentifier).join(', ') : 'rowid';
    const count = tableCount(sqlite, table);
    counts[table] = count;
    hash.update(`${JSON.stringify([table, columns.map((column) => column.name), count])}\n`);
    const rows = sqlite.prepare(`select * from ${tableIdentifier} order by ${orderBy}`).iterate();
    for (const row of rows) hash.update(`${JSON.stringify(row)}\n`);
  }
  return {
    counts,
    sha256: hash.digest('hex'),
    tableCount: Object.keys(counts).length,
    seedMarker: marker?.id === 'acc-giro' && institution?.id === 'inst-bank-a',
    auditLogRows,
  };
}

function readDatasetMetadata(databasePath: string, verifyFixture: boolean) {
  const opened = openDatabase(databasePath);
  try {
    return datasetMetadata(sqliteOf(opened.db), verifyFixture);
  } finally {
    opened.close();
  }
}

function sampleCounts() {
  return {
    planned: PLANNED_SAMPLES,
    attempted: samples.length,
    completed: samples.filter((sample) => sample.complete).length,
    byRouteAndState: ROUTES.flatMap((route) =>
      (['cold', 'warm'] as const).map((state) => {
        const selected = samples.filter(
          (sample) => sample.route === `/api${route}` && sample.state === state,
        );
        return {
          route: `/api${route}`,
          state,
          planned: SAMPLES_PER_STATE,
          attempted: selected.length,
          completed: selected.filter((sample) => sample.complete).length,
        };
      }),
    ),
  };
}

function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle =
    sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]!
      : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  return {
    n: sorted.length,
    medianMs: Number(middle.toFixed(3)),
    minMs: Number(sorted[0]!.toFixed(3)),
    maxMs: Number(sorted.at(-1)!.toFixed(3)),
  };
}

function distribution(values: number[]) {
  const { medianMs, minMs, maxMs, n } = summary(values);
  return { n, median: medianMs, min: minMs, max: maxMs };
}

function sqlSummary(rows: Sample[], method: 'prepare' | keyof SqlProfile['execution']) {
  const entries = rows.map((sample) =>
    method === 'prepare' ? sample.sql!.prepare : sample.sql!.execution[method],
  );
  return {
    count: distribution(entries.map((entry) => entry.count)),
    totalMs: summary(entries.map((entry) => entry.totalMs)),
  };
}

async function runSample(
  route: (typeof ROUTES)[number],
  state: State,
  index: number,
  databasePath: string,
) {
  let close: (() => void) | undefined;
  let sqlProfile: SqlProfile | undefined;
  const sample: Sample = { state, route: `/api${route}`, index, complete: false };
  samples.push(sample);
  try {
    const setupStart = performance.now();
    const opened = openDatabase(databasePath);
    close = opened.close;
    if (profileEnabled) {
      sqlProfile = emptySqlProfile();
      instrumentSqlite(sqliteOf(opened.db), sqlProfile);
    }
    const api = createLedgerApi({
      db: opened.db,
      today: () => '2026-09-17',
      stepUp: async (_context, next) => next(),
      bankSync: null,
    });
    const app = new Hono().route('/api', api);
    sample.setupMs = Number((performance.now() - setupStart).toFixed(3));

    if (state === 'warm') {
      const warmStart = performance.now();
      const warmed = await api.warm();
      sample.warmupMs = Number((performance.now() - warmStart).toFixed(3));
      if (warmed !== EXPECTED_WARM_MODELS) {
        throw new Error(
          `Warm-up prerequisite failed: api.warm() reported ${warmed}; expected exactly ${EXPECTED_WARM_MODELS} successful Heute models after #349. No request was timed.`,
        );
      }
    } else {
      sample.warmupMs = 0;
    }

    if (profileEnabled && sqlProfile) {
      for (const stat of [sqlProfile.prepare, ...Object.values(sqlProfile.execution)]) {
        stat.count = 0;
        stat.totalMs = 0;
      }
    }
    let response: Response;
    let body: string;
    const requestStart = performance.now();
    const cpuStart = profileEnabled ? process.cpuUsage() : undefined;
    try {
      response = await app.request(`/api${route}`);
      body = await response.text();
      sample.requestMs = Number((performance.now() - requestStart).toFixed(3));
    } finally {
      if (cpuStart && sqlProfile) {
        const cpu = process.cpuUsage(cpuStart);
        sample.processCpuUs = { user: cpu.user, system: cpu.system };
        sample.sql = sqlProfile;
      }
    }
    sample.status = response.status;
    sample.bytes = Buffer.byteLength(body, 'utf8');
    sample.responseSha256 = createHash('sha256').update(body).digest('hex');
    if (response.status !== 200) throw new Error(`Expected HTTP 200, received ${response.status}.`);
    try {
      JSON.parse(body);
    } catch {
      throw new Error('The Heute response was not valid JSON.');
    }
    sample.complete = true;
  } catch (error) {
    sample.error = error instanceof Error ? error.message : 'Unknown sample failure.';
    throw error;
  } finally {
    close?.();
  }
}

async function main() {
  const repositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
  const databasePath = selectedDatabasePath();
  assertAllowedPath(databasePath, realpathSync(repositoryRoot));
  report.git = gitMetadata(repositoryRoot);

  const datasetBefore = readDatasetMetadata(databasePath, true);
  report.datasetBefore = datasetBefore;

  let sampleFailure: Error | undefined;
  for (const route of ROUTES) {
    for (let index = 1; index <= SAMPLES_PER_STATE; index++) {
      try {
        await runSample(route, 'cold', index, databasePath);
        await runSample(route, 'warm', index, databasePath);
      } catch (error) {
        sampleFailure = error instanceof Error ? error : new Error('Unknown sample failure.');
        break;
      }
    }
    if (sampleFailure) break;
  }

  const datasetAfter = readDatasetMetadata(databasePath, false);
  report.datasetAfter = datasetAfter;
  const unchanged =
    datasetBefore.sha256 === datasetAfter.sha256 &&
    JSON.stringify(datasetBefore.counts) === JSON.stringify(datasetAfter.counts);
  report.datasetUnchanged = unchanged;
  if (!unchanged) throw new Error('Prepared SQLite dataset changed during handler samples.');
  if (sampleFailure) throw sampleFailure;

  for (const route of ROUTES) {
    const cold = samples.filter(
      (sample) => sample.route === `/api${route}` && sample.state === 'cold',
    );
    const warm = samples.filter(
      (sample) => sample.route === `/api${route}` && sample.state === 'warm',
    );
    if (cold.length !== SAMPLES_PER_STATE || warm.length !== SAMPLES_PER_STATE)
      throw new Error(`Incomplete sample set for /api${route}.`);
    for (let index = 0; index < SAMPLES_PER_STATE; index++) {
      if (cold[index]!.responseSha256 !== warm[index]!.responseSha256)
        throw new Error(`Cold/warm JSON hash mismatch for /api${route}, sample ${index + 1}.`);
    }
  }

  report.summaries = ROUTES.flatMap((route) =>
    (['cold', 'warm'] as const).map((state) => {
      const selected = samples.filter(
        (sample) => sample.route === `/api${route}` && sample.state === state,
      );
      const result: Record<string, unknown> = {
        route: `/api${route}`,
        state,
        request: summary(selected.map((sample) => sample.requestMs!)),
        setup: summary(selected.map((sample) => sample.setupMs!)),
        warmup: summary(selected.map((sample) => sample.warmupMs!)),
        statuses: selected.map((sample) => sample.status),
        bytes: selected.map((sample) => sample.bytes),
        responseSha256: selected.map((sample) => sample.responseSha256),
      };
      if (profileEnabled) {
        result.processCpuUs = {
          user: distribution(selected.map((sample) => sample.processCpuUs!.user)),
          system: distribution(selected.map((sample) => sample.processCpuUs!.system)),
        };
        result.sql = {
          prepare: sqlSummary(selected, 'prepare'),
          execution: {
            get: sqlSummary(selected, 'get'),
            all: sqlSummary(selected, 'all'),
            run: sqlSummary(selected, 'run'),
            iterate: sqlSummary(selected, 'iterate'),
          },
        };
      }
      return result;
    }),
  );
  report.ok = true;
}

main()
  .catch((error) => {
    report.ok = false;
    report.error = error instanceof Error ? error.message : 'Unknown measurement failure.';
    process.exitCode = 1;
  })
  .finally(() => {
    report.sampleCounts = sampleCounts();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  });
