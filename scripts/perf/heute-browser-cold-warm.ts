import { execFileSync, spawn, type ChildProcessByStdio } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { Readable } from 'node:stream';
import {
  chromium,
  request,
  type Browser,
  type BrowserContext,
  type Page,
  type Request,
} from '@playwright/test';
import { openDatabase, sqliteOf } from '@budget/db';
import { E2E_SETUP_TOKEN } from '../../e2e/setup-token';
import { bootstrapPasskey } from '../../e2e/bootstrap';

const TODAY = '2026-09-17';
const MONTH = '2026-09';
const N = 10;
const CONTENT_TIMEOUT = 90_000;
const WARM_MODELS = 2;
const AUTH = new Set(['passkey', 'auth_session', 'recovery_code', 'auth_challenge', 'auth_event']);
const REQUIRED = [
  '/api/auth/status',
  '/api/budget/' + MONTH,
  '/api/goals?month=' + MONTH,
  '/api/goals?month=2026-08',
  '/api/savings-plans/execution-proposals',
];
type State = 'cold' | 'warm';
type ApiRow = {
  sequence: number;
  method: string;
  path: string;
  status: number | null;
  observedMs: number;
  bytes: number | null;
  sha256: string | null;
  failure?: string;
};
type Sample = {
  state: State;
  index: number;
  attempted: boolean;
  complete: boolean;
  api: ApiRow[];
  sessionRefreshMs?: number;
  serverStartupMs?: number;
  warmupModels?: number;
  warmupMs?: number;
  browserSetupMs?: number;
  navigationMs?: number;
  fullContentMs?: number;
  heute?: ApiRow;
  error?: string;
  cleanupError?: string;
};
type Fingerprint = {
  tableCount: number;
  counts: Record<string, number>;
  authCounts: Record<string, number>;
  sha256: string;
  seedMarker: { account: string; institution: string };
  auditLogRows: number;
};
type LocalServer = {
  child: ChildProcessByStdio<null, Readable, Readable>;
  origin: string;
  started: number;
  listening: boolean;
  exited: boolean;
  warmup?: { models: number; ms: number };
  warmupFailed: boolean;
  wait: (warm: boolean) => Promise<void>;
  stop: () => Promise<void>;
};

const samples: Sample[] = [];
const report: Record<string, unknown> = {
  protocol: 'heute-browser-cold-warm-v1',
  today: TODAY,
  month: MONTH,
  period: 'payday',
  plannedSamples: 2 * N,
  samplesPerState: N,
  expectedWarmModels: WARM_MODELS,
  timeoutsMs: { startup: 30_000, warmup: 120_000, navigation: 60_000, content: 90_000 },
  runtime: { node: process.version, platform: process.platform, arch: process.arch, browser: null },
  authenticationPreparation: {
    method: 'real synthetic SoftAuthenticator bootstrap',
    timestampRefresh: 'auth_session only, before each measured server',
    sessionIdReported: false,
  },
  samples,
};
let dbPath: string | undefined;
let baseline: Fingerprint | undefined;
let browser: Browser | undefined;
let tempDir: string | undefined;
let stateFile: string | undefined;
let sessionHash: string | undefined;
let failure: string | undefined;
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Unknown failure.');

function gitMetadata(root: string) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const source = readFileSync(resolve('scripts/perf/heute-browser-cold-warm.ts'));
  return {
    head,
    dirty: Boolean(status),
    dirtyEntryCount: status ? status.split(/\r?\n/).length : 0,
    harnessSha256: createHash('sha256').update(source).digest('hex'),
  };
}

function selectedDatabase(): string {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--database' || !args[1]) {
    throw new Error(
      'Usage: npx tsx scripts/perf/heute-browser-cold-warm.ts --database <absolute-synthetic-db-path>',
    );
  }
  if (!isAbsolute(args[1]) || !existsSync(args[1]) || !statSync(args[1]).isFile()) {
    throw new Error('Select an existing absolute synthetic database; preparation is separate.');
  }
  return realpathSync(args[1]);
}

function assertDbPath(path: string, root: string) {
  const rel = relative(root, path);
  if (rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel))) {
    throw new Error('Refusing a database inside the repository.');
  }
  if (path.split(/[\\/]+/).some((part) => part.toLowerCase() === 'dropbox')) {
    throw new Error('Refusing a database under a Dropbox path.');
  }
}

const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
function tableRows(sqlite: ReturnType<typeof sqliteOf>, name: string): number {
  return (sqlite.prepare('select count(*) as count from ' + quote(name)).get() as { count: number })
    .count;
}

function fingerprint(path: string, checkSeed: boolean): Fingerprint {
  const opened = openDatabase(path);
  try {
    const sqlite = sqliteOf(opened.db);
    const account = sqlite
      .prepare('select id,name,opening_date from account where id=?')
      .get('acc-giro') as { id: string; name: string; opening_date: string } | undefined;
    const institution = sqlite
      .prepare('select id,name from institution where id=?')
      .get('inst-bank-a') as { id: string; name: string } | undefined;
    const auditLogRows = tableRows(sqlite, 'audit_log');
    if (
      checkSeed &&
      (account?.id !== 'acc-giro' ||
        account.name !== 'Girokonto' ||
        account.opening_date !== '2023-10-01' ||
        institution?.id !== 'inst-bank-a' ||
        institution.name !== 'Bank A' ||
        auditLogRows !== 0)
    ) {
      throw new Error('Synthetic fixture markers or empty audit log check failed.');
    }
    const hash = createHash('sha256');
    const tables = sqlite
      .prepare("select name from sqlite_master where type='table' order by name")
      .all() as { name: string }[];
    const counts: Record<string, number> = {};
    const authCounts: Record<string, number> = {};
    let tableCount = 0;
    for (const { name } of tables) {
      if (name.toLowerCase().startsWith('sqlite_')) continue;
      tableCount++;
      const count = tableRows(sqlite, name);
      if (AUTH.has(name)) {
        authCounts[name] = count;
        continue;
      }
      counts[name] = count;
      const table = quote(name);
      const columns = sqlite.prepare('pragma table_info(' + table + ')').all() as {
        name: string;
        pk: number;
      }[];
      const pk = columns
        .filter((column) => column.pk)
        .sort((a, b) => a.pk - b.pk)
        .map((column) => column.name);
      const order = pk.length ? pk.map(quote).join(',') : 'rowid';
      hash.update(JSON.stringify([name, columns.map((column) => column.name), count]) + '\n');
      for (const row of sqlite.prepare('select * from ' + table + ' order by ' + order).iterate()) {
        hash.update(JSON.stringify(row) + '\n');
      }
    }
    return {
      tableCount,
      counts,
      authCounts,
      sha256: hash.digest('hex'),
      seedMarker: { account: account?.id ?? 'missing', institution: institution?.id ?? 'missing' },
      auditLogRows,
    };
  } finally {
    opened.close();
  }
}

async function freePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve a local port.');
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
  return address.port;
}

function serverEnvironment(
  port: number,
  origin: string,
  path: string,
  warm: boolean,
  setup: boolean,
) {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, {
    NODE_ENV: 'test',
    PORT: String(port),
    WEB_DIR: resolve('apps/web/dist'),
    DATABASE_PATH: path,
    BUDGET_ORIGIN: origin,
    BUDGET_RP_ID: 'localhost',
    BUDGET_TODAY: TODAY,
    BUDGET_WARM_UP: warm ? '1' : '0',
    BUDGET_MARKET_DAILY: '0',
    BUDGET_BANK_SYNC_DAILY: '0',
    ENABLE_BANKING_APP_ID: '',
    DROPBOX_PAYSLIP_ROOT: '',
    BUDGET_DEBUG_API: '0',
  });
  if (setup) env['BUDGET_SETUP_TOKEN'] = E2E_SETUP_TOKEN;
  return env;
}

async function startServer(path: string, warm: boolean, setup = false): Promise<LocalServer> {
  const port = await freePort();
  const origin = 'http://localhost:' + port;
  const child = spawn(process.execPath, ['apps/server/dist/index.js'], {
    cwd: process.cwd(),
    env: serverEnvironment(port, origin, path, warm, setup),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const server: LocalServer = {
    child,
    origin,
    started: performance.now(),
    listening: false,
    exited: false,
    warmupFailed: false,
    wait: async (needWarmup) => {
      const startBy = Date.now() + 30_000;
      while (!server.listening) {
        if (server.exited) throw new Error('Owned server exited before listening.');
        if (Date.now() >= startBy) throw new Error('Server startup timed out.');
        await pause(100);
      }
      let healthy = false;
      const healthBy = Date.now() + 5_000;
      while (!healthy && Date.now() < healthBy) {
        try {
          healthy =
            (await fetch(origin + '/health', { signal: AbortSignal.timeout(1_000) })).status ===
            200;
        } catch {
          /* Retry only this bounded readiness request to the owned local server. */
        }
        if (!healthy) await pause(100);
      }
      if (!healthy) throw new Error('Owned server /health did not return HTTP 200.');
      if (!needWarmup) return;
      const warmBy = Date.now() + 120_000;
      while (!server.warmup && !server.warmupFailed) {
        if (server.exited) throw new Error('Owned server exited before warm-up completed.');
        if (Date.now() >= warmBy) throw new Error('Server warm-up log timed out.');
        await pause(100);
      }
      if (server.warmupFailed) throw new Error('Server logged a warm-up failure.');
      if (server.warmup!.models !== WARM_MODELS) {
        throw new Error(
          'Warm-up prerequisite failed: startup log reported ' +
            server.warmup!.models +
            '; expected exactly ' +
            WARM_MODELS +
            ' after #349.',
        );
      }
    },
    stop: async () => {
      if (server.exited) return;
      const exited = new Promise<void>((done) => child.once('exit', () => done()));
      child.kill('SIGTERM');
      if (await Promise.race([exited.then(() => true), pause(5_000).then(() => false)])) return;
      child.kill('SIGKILL');
      if (!(await Promise.race([exited.then(() => true), pause(5_000).then(() => false)]))) {
        throw new Error('Owned server process did not stop within cleanup timeout.');
      }
    },
  };
  const parseLine = (text: string) => {
    if (text.includes('Budget server listening on ')) server.listening = true;
    const warm = text.match(/Warm-up: (\d+) read models ready after (\d+) ms/);
    if (warm) server.warmup = { models: Number(warm[1]), ms: Number(warm[2]) };
    if (text.includes('Warm-up failed')) server.warmupFailed = true;
  };
  const consumeLines = () => {
    let carry = '';
    const consume = (chunk: Buffer) => {
      const lines = (carry + chunk.toString('utf8')).split(/\r?\n/);
      carry = lines.pop() ?? '';
      for (const line of lines) parseLine(line);
      if (carry.length > 16_384) {
        parseLine(carry);
        carry = '';
      }
    };
    const flush = () => {
      if (carry) parseLine(carry);
      carry = '';
    };
    return { consume, flush };
  };
  const stdout = consumeLines();
  const stderr = consumeLines();
  child.stdout.on('data', stdout.consume);
  child.stderr.on('data', stderr.consume);
  child.stdout.once('end', stdout.flush);
  child.stderr.once('end', stderr.flush);
  child.once('exit', () => {
    server.exited = true;
  });
  child.once('error', () => {
    server.exited = true;
  });
  return server;
}

function sessionIdFromState(path: string): string {
  const state = JSON.parse(readFileSync(path, 'utf8')) as {
    cookies?: { name: string; value: string }[];
  };
  const cookie = state.cookies?.find((item) => item.name === 'budget_session');
  if (!cookie?.value)
    throw new Error('Synthetic passkey bootstrap did not return its session cookie.');
  return createHash('sha256').update(cookie.value).digest('hex');
}

function refreshSession(path: string, idHash: string): number {
  const opened = openDatabase(path);
  const start = performance.now();
  try {
    const sqlite = sqliteOf(opened.db);
    const row = sqlite
      .prepare('select created_at,revoked_at from auth_session where id=?')
      .get(idHash) as { created_at: string; revoked_at: string | null } | undefined;
    if (!row || row.revoked_at) throw new Error('Prepared synthetic auth session is unavailable.');
    const now = Date.now();
    const expiry = Math.min(now + 30 * 86_400_000, Date.parse(row.created_at) + 90 * 86_400_000);
    const changed = sqlite
      .prepare(
        'update auth_session set last_seen_at=?,expires_at=? where id=? and revoked_at is null',
      )
      .run(new Date(now).toISOString(), new Date(expiry).toISOString(), idHash).changes;
    if (expiry <= now || changed !== 1)
      throw new Error('Could not refresh exactly one valid auth session.');
  } finally {
    opened.close();
  }
  return Number((performance.now() - start).toFixed(3));
}

async function prepareAuth(path: string, statePath: string): Promise<string> {
  const server = await startServer(path, false, true);
  let context: Awaited<ReturnType<typeof request.newContext>> | undefined;
  try {
    await server.wait(false);
    context = await request.newContext({ baseURL: server.origin });
    await bootstrapPasskey(context, server.origin, statePath);
    return sessionIdFromState(statePath);
  } finally {
    try {
      await context?.dispose();
    } finally {
      await server.stop();
    }
  }
}

function observeApi(page: Page) {
  const starts = new Map<Request, { at: number; sequence: number; method: string; path: string }>();
  const pending = new Set<Promise<void>>();
  const rows: ApiRow[] = [];
  let sequence = 0;
  const failed = (
    req: Request,
    start: { at: number; sequence: number; method: string; path: string },
    reason: string,
  ) => {
    if (starts.get(req) !== start) return;
    rows.push({
      sequence: start.sequence,
      method: start.method,
      path: start.path,
      status: null,
      observedMs: Number((performance.now() - start.at).toFixed(3)),
      bytes: null,
      sha256: null,
      failure: reason,
    });
    starts.delete(req);
  };
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api/'))
      starts.set(req, {
        at: performance.now(),
        sequence: ++sequence,
        method: req.method(),
        path: url.pathname + url.search,
      });
  });
  page.on('requestfinished', (req) => {
    const start = starts.get(req);
    if (!start) return;
    const task: Promise<void> = (async () => {
      const response = await req.response();
      if (!response) return failed(req, start, 'Request finished without a response.');
      const body = await response.body();
      if (starts.get(req) !== start) return;
      rows.push({
        sequence: start.sequence,
        method: start.method,
        path: start.path,
        status: response.status(),
        observedMs: Number((performance.now() - start.at).toFixed(3)),
        bytes: body.byteLength,
        sha256: createHash('sha256').update(body).digest('hex'),
      });
      starts.delete(req);
    })()
      .catch(() => failed(req, start, 'Could not read completed API response body.'))
      .finally(() => pending.delete(task));
    pending.add(task);
  });
  page.on('requestfailed', (req) => {
    const start = starts.get(req);
    if (start) failed(req, start, req.failure()?.errorText ?? 'API request failed.');
  });
  return {
    rows,
    isIdle() {
      return starts.size === 0 && pending.size === 0;
    },
    async settle(deadline = Date.now() + CONTENT_TIMEOUT) {
      while (starts.size || pending.size) {
        if (Date.now() >= deadline) {
          for (const [req, start] of starts)
            failed(req, start, 'Timed out waiting for API request completion.');
          rows.sort((a, b) => a.sequence - b.sequence);
          throw new Error('Timed out waiting for all in-flight API requests and response bodies.');
        }
        if (pending.size) await Promise.race([Promise.all([...pending]), pause(25)]);
        else await pause(25);
      }
      rows.sort((a, b) => a.sequence - b.sequence);
    },
  };
}

function assertApi(rows: ApiRow[]): ApiRow {
  const heute = rows.find((row) => {
    if (!row.path.startsWith('/api/heute?')) return false;
    const query = new URLSearchParams(row.path.slice(row.path.indexOf('?') + 1));
    return query.get('period') === 'payday' && query.get('month') === MONTH;
  });
  if (heute?.status !== 200 || !heute.sha256)
    throw new Error('No successful current-navigation Heute response.');
  for (const path of REQUIRED) {
    if (!rows.some((row) => row.method === 'GET' && row.path === path && row.status === 200)) {
      throw new Error('Required Heute-derived GET did not return HTTP 200: ' + path);
    }
  }
  const bad = rows.find((row) => row.method !== 'GET' || row.status !== 200);
  if (bad)
    throw new Error(
      'Unexpected API request/status: ' + bad.method + ' ' + bad.path + ' (' + bad.status + ').',
    );
  return heute;
}

async function waitForPage(page: Page): Promise<void> {
  const visible = [
    '#answer-wealth-title',
    '#answer-month-title',
    '#answer-budget-title',
    '[data-testid="heute-lead-value"]',
    '[data-testid="heute-plan-rest-note"]',
    '[data-testid="heute-balance-chart"]',
    '[data-testid="heute-daily-budget"]',
    '[data-testid="heute-pace-chart"]',
    '#attention-title',
    '#heute-upcoming-title',
    '#heute-wealth-title',
  ];
  await Promise.all(
    visible.map((selector) =>
      page.locator(selector).waitFor({ state: 'visible', timeout: CONTENT_TIMEOUT }),
    ),
  );
  const more = page.getByRole('button', { name: 'Mehr zum Monat' });
  await more.waitFor({ state: 'visible', timeout: CONTENT_TIMEOUT });
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  await page
    .locator('#heute-more-content:not([hidden])')
    .waitFor({ state: 'visible', timeout: CONTENT_TIMEOUT });
  const expanded = [
    '#heute-next-title',
    '#heute-pinned-title',
    '#heute-check-title',
    '#heute-net-title',
    '#heute-bookings-title',
    '#heute-later-title',
    '[aria-label="Ziele finanzieren"]',
    '#heute-more-content a[href*="/reports/budgettreue"]',
    'section[aria-labelledby="heute-upcoming-title"] .heute-upcoming, section[aria-labelledby="heute-upcoming-title"] .rev-empty',
    'section[aria-labelledby="heute-wealth-title"] svg[role="img"], section[aria-labelledby="heute-wealth-title"] .rev-empty',
    'section[aria-labelledby="heute-next-title"] .rev-table, section[aria-labelledby="heute-next-title"] .rev-empty',
    'section[aria-labelledby="heute-pinned-title"] .heute-list, section[aria-labelledby="heute-pinned-title"] .rev-empty',
    'section[aria-labelledby="heute-check-title"] .heute-check-counts, section[aria-labelledby="heute-check-title"] .rev-empty',
    'section[aria-labelledby="heute-net-title"] .heute-net-composition, section[aria-labelledby="heute-net-title"] .rev-empty',
    'section[aria-labelledby="heute-bookings-title"] .heute-list, section[aria-labelledby="heute-bookings-title"] .rev-empty',
    'section[aria-labelledby="heute-later-title"] .heute-upcoming, section[aria-labelledby="heute-later-title"] .rev-empty',
  ];
  await Promise.all(
    expanded.map((selector) =>
      page.locator(selector).first().waitFor({ state: 'visible', timeout: CONTENT_TIMEOUT }),
    ),
  );
}

async function settleHeute(page: Page, observer: ReturnType<typeof observeApi>, deadline: number) {
  while (true) {
    await observer.settle(deadline);
    await page.waitForFunction(() => document.fonts.status === 'loaded', undefined, {
      timeout: CONTENT_TIMEOUT,
    });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    if (observer.isIdle()) break;
  }
  const unfinished = page.locator('.heute [aria-busy="true"], .heute [role="alert"]');
  if (await unfinished.count()) {
    throw new Error('Heute still shows a loading or error state after its API requests settled.');
  }
}

async function runSample(state: State, index: number): Promise<void> {
  const sample: Sample = { state, index, attempted: true, complete: false, api: [] };
  samples.push(sample);
  let server: LocalServer | undefined;
  let context: BrowserContext | undefined;
  let observer: ReturnType<typeof observeApi> | undefined;
  let apiDeadline: number | undefined;
  try {
    sample.sessionRefreshMs = refreshSession(dbPath!, sessionHash!);
    server = await startServer(dbPath!, state === 'warm');
    await server.wait(state === 'warm');
    sample.serverStartupMs = Number((performance.now() - server.started).toFixed(3));
    sample.warmupModels = server.warmup?.models ?? 0;
    sample.warmupMs = server.warmup?.ms ?? 0;
    const setup = performance.now();
    context = await browser!.newContext({
      storageState: stateFile!,
      viewport: { width: 1440, height: 900 },
      colorScheme: 'light',
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
      timezoneId: 'Europe/Vienna',
    });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-09-17T08:30:00+02:00'));
    observer = observeApi(page);
    sample.browserSetupMs = Number((performance.now() - setup).toFixed(3));
    const nav = performance.now();
    await page.goto(server.origin + '/?monat=' + MONTH + '&period=payday', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    sample.navigationMs = Number((performance.now() - nav).toFixed(3));
    await waitForPage(page);
    apiDeadline = Date.now() + CONTENT_TIMEOUT;
    await settleHeute(page, observer, apiDeadline);
    sample.heute = assertApi(observer.rows);
    sample.fullContentMs = Number((performance.now() - nav).toFixed(3));
    sample.complete = true;
  } catch (error) {
    sample.error = errorText(error);
    throw error;
  } finally {
    if (server) {
      sample.serverStartupMs ??= Number((performance.now() - server.started).toFixed(3));
      sample.warmupModels = server.warmup?.models ?? 0;
      sample.warmupMs = server.warmup?.ms ?? 0;
    }
    await observer?.settle(apiDeadline).catch((error) => {
      sample.cleanupError = 'Collect API responses: ' + errorText(error);
    });
    sample.api = observer?.rows ?? [];
    if (!sample.heute && observer) {
      const heute = observer.rows.find(
        (row) =>
          row.path.startsWith('/api/heute?') &&
          new URLSearchParams(row.path.slice(row.path.indexOf('?') + 1)).get('period') === 'payday',
      );
      if (heute) sample.heute = heute;
    }
    try {
      await context?.close();
    } catch (error) {
      sample.cleanupError ??= 'Close browser context: ' + errorText(error);
    }
    try {
      await server?.stop();
    } catch (error) {
      sample.cleanupError ??= 'Stop owned server: ' + errorText(error);
    }
    if (sample.cleanupError) {
      sample.complete = false;
      sample.error ??= sample.cleanupError;
    }
  }
  if (sample.cleanupError) throw new Error(sample.cleanupError);
}

function sampleCounts() {
  return {
    planned: 2 * N,
    attempted: samples.filter((sample) => sample.attempted).length,
    completed: samples.filter((sample) => sample.complete).length,
    byState: (['cold', 'warm'] as const).map((state) => {
      const rows = samples.filter((sample) => sample.state === state);
      return {
        state,
        planned: N,
        attempted: rows.filter((sample) => sample.attempted).length,
        completed: rows.filter((sample) => sample.complete).length,
      };
    }),
  };
}

function summarize(values: number[]) {
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

function parityFailure(): string | undefined {
  const cold = samples
    .filter((sample) => sample.state === 'cold')
    .sort((a, b) => a.index - b.index);
  const warm = samples
    .filter((sample) => sample.state === 'warm')
    .sort((a, b) => a.index - b.index);
  if (cold.length !== N || warm.length !== N)
    return 'Incomplete cold/warm payday response comparison.';
  for (let i = 0; i < N; i++) {
    if (cold[i]!.heute?.sha256 !== warm[i]!.heute?.sha256)
      return 'Cold/warm payload hash mismatch at sample ' + (i + 1) + '.';
  }
  return undefined;
}

function successSummaries() {
  report.summaries = (['cold', 'warm'] as const).map((state) => {
    const rows = samples.filter((sample) => sample.state === state && sample.complete);
    return {
      state,
      serverStartup: summarize(rows.map((sample) => sample.serverStartupMs!)),
      browserSetup: summarize(rows.map((sample) => sample.browserSetupMs!)),
      navigationToDomContentLoaded: summarize(rows.map((sample) => sample.navigationMs!)),
      navigationToFullContent: summarize(rows.map((sample) => sample.fullContentMs!)),
      browserObservedHeute: summarize(rows.map((sample) => sample.heute!.observedMs)),
      statuses: rows.map((sample) => sample.heute!.status),
      bytes: rows.map((sample) => sample.heute!.bytes),
      payloadSha256: rows.map((sample) => sample.heute!.sha256),
      warmup: summarize(rows.map((sample) => sample.warmupMs!)),
    };
  });
}

async function main(): Promise<void> {
  try {
    const root = realpathSync(process.cwd());
    report.git = gitMetadata(root);
    dbPath = selectedDatabase();
    assertDbPath(dbPath, root);
    if (
      !existsSync(resolve('apps/server/dist/index.js')) ||
      !existsSync(resolve('apps/web/dist/index.html'))
    ) {
      throw new Error(
        'Existing server and web bundles are required; this harness does not build them.',
      );
    }
    const before = fingerprint(dbPath, true);
    baseline = before;
    report.financeBeforeAuth = before;
    tempDir = mkdtempSync(join(tmpdir(), 'budget-heute-280-browser-'));
    stateFile = join(tempDir, 'synthetic-session.json');
    const authStart = performance.now();
    sessionHash = await prepareAuth(dbPath, stateFile);
    report.authPreparationMs = Number((performance.now() - authStart).toFixed(3));
    const afterAuth = fingerprint(dbPath, false);
    report.financeAfterAuth = afterAuth;
    if (
      before.sha256 !== afterAuth.sha256 ||
      JSON.stringify(before.counts) !== JSON.stringify(afterAuth.counts)
    ) {
      throw new Error('Auth preparation changed a non-auth database table.');
    }
    baseline = afterAuth;
    report.authCountsBeforeSamples = afterAuth.authCounts;

    browser = await chromium.launch({ headless: true });
    report.runtime = {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      browser: 'Chromium ' + browser.version(),
    };
    for (const state of ['cold', 'warm'] as const) {
      for (let i = 1; i <= N; i++) {
        try {
          await runSample(state, i);
        } catch (error) {
          failure = errorText(error);
          break;
        }
      }
      if (failure) break;
    }
  } catch (error) {
    failure ??= errorText(error);
  } finally {
    try {
      await browser?.close();
    } catch (error) {
      failure ??= 'Close Chromium: ' + errorText(error);
    }
    if (dbPath && baseline) {
      try {
        const after = fingerprint(dbPath, false);
        report.financeAfterSamples = after;
        report.financeDatasetUnchanged =
          baseline.sha256 === after.sha256 &&
          JSON.stringify(baseline.counts) === JSON.stringify(after.counts);
        if (!report.financeDatasetUnchanged)
          failure ??= 'Non-auth database rows changed during browser samples.';
        report.authCountsAfterSamples = after.authCounts;
      } catch (error) {
        failure ??= 'Verify final fingerprint: ' + errorText(error);
      }
    }
    if (tempDir) {
      try {
        if (stateFile && existsSync(stateFile)) unlinkSync(stateFile);
        rmdirSync(tempDir);
        report.temporarySessionStateRemoved = true;
      } catch (error) {
        report.temporarySessionStateRemoved = false;
        failure ??= 'Remove owned temporary session state: ' + errorText(error);
      }
    }
    report.sampleCounts = sampleCounts();
    if (!failure && samples.length === 2 * N && samples.every((sample) => sample.complete))
      failure = parityFailure();
    if (!failure && samples.length === 2 * N && samples.every((sample) => sample.complete)) {
      successSummaries();
      report.ok = true;
    } else {
      report.ok = false;
      report.error = failure ?? 'The planned sample set was incomplete.';
      process.exitCode = 1;
    }
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  }
}

void main();
