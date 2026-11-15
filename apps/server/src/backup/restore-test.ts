import {
  accountSummaries,
  openReadonlyDatabase,
  schema,
  sqliteOf,
  writesHeld,
  type Db,
} from '@budget/db';
import { todayInVienna } from '@budget/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { spawn } from 'node:child_process';
// Aliased: the server bundle's esbuild banner already declares `createRequire`.
import { createRequire as moduleRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, statfs } from 'node:fs/promises';
import { freemem } from 'node:os';
import { dirname, join } from 'node:path';
import { setImmediate as yieldLoop, setTimeout as sleep } from 'node:timers/promises';
import type { BackupConfig } from './backup';
import { acquireMaintenanceLock, lockPathFor } from './lock';
import { backupDay, latestArchiveKey } from './retention';
import { S3Client, S3Error } from './s3';

/**
 * Monthly restore test (issue #1106, docs/ops.md section 8.4).
 *
 * The server holds only the age *public* key, so it cannot decrypt its own night copies and must
 * not be able to. The test therefore proves what can be proven without the private key:
 *
 * 1. the newest night copy exists and its ciphertext can be read back completely (length, ETag
 *    and age header), streamed without touching the disk;
 * 2. the Litestream replica restores into a throw-away file whose `PRAGMA integrity_check`, table
 *    row counts and account balances equal the live database it was replicated from.
 *
 * The live database is only read. The copy lives in a private folder next to the database (on the
 * data volume, whose space is what is checked) and is removed after every attempt, also on failure. No figure, key or storage detail leaves this module: results
 * carry a status, a reason code, the backup file name and at most a few table names.
 */

export const RESTORE_TEST_SETTING = 'backup.restore_test';
export const RESTORE_TEST_INBOX_REF = 'restore_test';
export const RESTORE_TEST_OVERDUE_DAYS = 40;

const DAY = 86_400_000;
const SCRATCH_PREFIX = 'budget-restore-test-';
/** A night copy older than this many UTC days means the nightly job has stopped. */
const MAX_BACKUP_AGE_DAYS = 3;
/** Waits before the restore of attempt 1, 2, 3 (x settle base): replication needs time to catch up. */
const SETTLE_STEPS = [1, 3, 6];
/** The restored copy is about the size of the database (Litestream writes `<out>.tmp`, then renames). */
const SPACE_FACTOR = 1.05;
/** Free space that must remain on the volume while the copy exists, so a growing WAL is never starved. */
export const DISK_FLOOR_BYTES = 150 * 1_048_576;
/** Available memory needed next to the server and Litestream (restore child plus checker child). */
export const MEMORY_FLOOR_BYTES = 128 * 1_048_576;

export type RestoreTestReason =
  | 'backup_missing'
  | 'backup_unreadable'
  | 'storage_unavailable'
  | 'replica_missing'
  | 'restore_failed'
  | 'copy_corrupt'
  | 'mismatch'
  | 'not_enough_space'
  | 'database_busy'
  | 'backup_stale'
  | 'not_enough_memory'
  | 'backup_running';

export interface RestoreTestOutcome {
  status: 'ok' | 'failed' | 'skipped';
  /** File name of the night copy that was checked (`budget-YYYY-MM-DD.tar.age`), if one exists. */
  backupName: string | null;
  reason?: RestoreTestReason;
  /** `mismatch` only: names of the tables (or `account balances`) that differ; never values. */
  differences?: string[];
}

/** Fixed German texts; nothing from a provider, driver or child process is ever forwarded. */
const REASON_TEXT: Record<RestoreTestReason, string> = {
  backup_missing: 'Es wurde keine abgeschlossene verschlüsselte Nachtsicherung gefunden.',
  backup_unreadable:
    'Die letzte verschlüsselte Nachtsicherung ließ sich nicht vollständig und unverändert lesen.',
  storage_unavailable: 'Der Sicherungsspeicher war nicht erreichbar.',
  replica_missing: 'Im Sicherungsspeicher wurde keine laufende Sicherung der Datenbank gefunden.',
  restore_failed: 'Die Wiederherstellung in eine Prüfkopie ist fehlgeschlagen.',
  copy_corrupt: 'Die wiederhergestellte Prüfkopie hat die Integritätsprüfung nicht bestanden.',
  mismatch: 'Die wiederhergestellte Prüfkopie weicht von der Datenbank ab.',
  not_enough_space: 'Zu wenig freier Speicherplatz für die Prüfkopie. Die Probe wurde ausgelassen.',
  database_busy:
    'Die Datenbank wurde während der Probe geändert. Die Probe wird am nächsten Tag wiederholt.',
  not_enough_memory:
    'Zu wenig freier Arbeitsspeicher für die Prüfkopie. Die Probe wurde ausgelassen.',
  backup_running:
    'Die nächtliche Sicherung läuft gerade. Die Probe wird beim nächsten Check wiederholt.',
  backup_stale:
    'Die letzte verschlüsselte Nachtsicherung ist älter als drei Tage. Der Nachtlauf scheint nicht zu laufen.',
};

export const restoreTestMessage = (outcome: Pick<RestoreTestOutcome, 'reason' | 'differences'>) =>
  outcome.reason === undefined
    ? null
    : outcome.reason === 'mismatch' && outcome.differences?.length
      ? `${REASON_TEXT.mismatch} Betroffen: ${outcome.differences.join(', ')}.`
      : REASON_TEXT[outcome.reason];

/** Restores the newest replicated state into `output`; `missing` when no replica exists. */
export interface Restorer {
  restore(output: string, signal?: AbortSignal): Promise<'restored' | 'missing'>;
}

/**
 * `litestream restore` into a side file, as in docs/ops.md section 4.2. Output of the child is
 * discarded: only the exit code and the presence of the file count.
 */
export function litestreamRestorer(options: {
  databasePath: string;
  bin?: string;
  config?: string;
  timeoutMs?: number;
}): Restorer {
  const bin = options.bin ?? process.env['BUDGET_LITESTREAM_BIN'] ?? 'litestream';
  const config = options.config ?? process.env['LITESTREAM_CONFIG'] ?? '/etc/litestream.yml';
  return {
    async restore(output, signal) {
      const code = await new Promise<number | null>((resolve, reject) => {
        const child = spawn(
          bin,
          ['restore', '-config', config, '-if-replica-exists', '-o', output, options.databasePath],
          {
            stdio: 'ignore',
            timeout: options.timeoutMs ?? 10 * 60_000,
            killSignal: 'SIGKILL',
            ...(signal ? { signal } : {}),
          },
        );
        child.once('error', reject);
        child.once('exit', resolve);
      });
      if (code !== 0) throw new Error('restore_failed');
      return (await stat(output).then(
        (s) => s.isFile(),
        () => false,
      ))
        ? 'restored'
        : 'missing';
    },
  };
}

/** Mirrors docker-entrypoint.sh: replication is on with BUDGET_REPLICATE=1 or a bucket. */
export function replicationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = env['BUDGET_REPLICATE'] ?? 'auto';
  return mode === '1' || (mode === 'auto' && Boolean(env['BUCKET_NAME']?.trim()));
}

interface Figures {
  counts: Record<string, number>;
  balances: Record<string, string>;
}

/** User tables only: SQLite's own and Litestream's bookkeeping tables are not data. */
const USER_TABLES_SQL = `SELECT name FROM sqlite_master WHERE type = 'table'
  AND name NOT LIKE 'sqlite!_%' ESCAPE '!' AND name NOT LIKE '!_litestream%' ESCAPE '!'
  ORDER BY name`;

/** Row counts of the live database, yielding to the event loop between tables. */
async function readCounts(db: Db): Promise<Record<string, number>> {
  const sqlite = sqliteOf(db);
  const counts: Record<string, number> = {};
  for (const name of sqlite.prepare(USER_TABLES_SQL).pluck().all() as string[]) {
    counts[name] = sqlite
      .prepare(`SELECT count(*) FROM "${name.replaceAll('"', '""')}"`)
      .pluck()
      .get() as number;
    await yieldLoop();
  }
  return counts;
}

/** Balances of every account from the shared ledger query (the figures the app shows). */
function readBalances(db: Db): Record<string, string> {
  const balances: Record<string, string> = {};
  for (const a of accountSummaries(db, todayInVienna()))
    balances[a.id] = [
      a.balanceCents,
      a.clearedCents,
      a.scheduledCents,
      a.bookingCount,
      a.pendingCount,
    ].join('|');
  return balances;
}

async function readFigures(db: Db): Promise<Figures> {
  return { counts: await readCounts(db), balances: readBalances(db) };
}

/** Table names whose counts differ, plus `account balances`; never a value. */
function differences(a: Figures, b: Figures): string[] {
  const names = [...new Set([...Object.keys(a.counts), ...Object.keys(b.counts)])].sort();
  const out = names.filter((name) => a.counts[name] !== b.counts[name]);
  const ids = new Set([...Object.keys(a.balances), ...Object.keys(b.balances)]);
  if ([...ids].some((id) => a.balances[id] !== b.balances[id])) out.push('account balances');
  return out;
}

/** What the integrity pass reports about the copy. */
export interface CopyReport {
  intact: boolean;
  counts: Record<string, number>;
}

/** Runs `PRAGMA integrity_check` and the row counts on the restored copy, off the event loop. */
export type CopyChecker = (path: string, signal: AbortSignal) => Promise<CopyReport>;

const CHECK_SCRIPT = `
const Database = require(process.argv[1]);
const db = new Database(process.argv[2], { readonly: true, fileMustExist: true });
const rows = db.pragma('integrity_check');
const report = { intact: rows.length === 1 && rows[0].integrity_check === 'ok', counts: {} };
if (report.intact)
  for (const name of db.prepare(${JSON.stringify(USER_TABLES_SQL)}).pluck().all())
    report.counts[name] = db.prepare('SELECT count(*) FROM "' + name.replaceAll('"', '""') + '"').pluck().get();
db.close();
process.stdout.write(JSON.stringify(report));
`;

/**
 * The integrity check is one long synchronous SQLite call (seconds on a few hundred MB), so it
 * runs in a child process with its own read-only connection and a capped heap. The child only
 * prints counts; nothing else crosses the process boundary. A bundled server has no second entry
 * file, hence the inline script (no Dockerfile change); `better-sqlite3` is resolved here.
 */
export const childCopyChecker: CopyChecker = (path, signal) =>
  new Promise((resolve, reject) => {
    const driver = moduleRequire(import.meta.url).resolve('better-sqlite3');
    const chunks: Buffer[] = [];
    let bytes = 0;
    const child = spawn(
      process.execPath,
      ['--max-old-space-size=64', '-e', CHECK_SCRIPT, driver, path],
      { stdio: ['ignore', 'pipe', 'ignore'], timeout: 15 * 60_000, killSignal: 'SIGKILL', signal },
    );
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes <= 1_048_576) chunks.push(chunk);
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      try {
        if (code !== 0 || bytes > 1_048_576) throw new Error('check_failed');
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as CopyReport);
      } catch (error) {
        reject(error);
      }
    });
  });

/** Memory the system could give a new process without swapping (Linux `MemAvailable`). */
export async function availableMemoryBytes(): Promise<number> {
  try {
    const kb = /^MemAvailable:\s+(\d+) kB/m.exec(await readFile('/proc/meminfo', 'utf8'))?.[1];
    if (kb) return Number(kb) * 1024;
  } catch {
    // Not Linux: fall through.
  }
  return freemem();
}

export interface RestoreTestDeps {
  db: Db;
  /** Path of the live database file (for its size and the lock; the file itself is never written). */
  databasePath: string;
  config: Pick<BackupConfig, 's3' | 'prefix'>;
  restorer: Restorer;
  client?: S3Client;
  /** Parent folder of the throw-away copy. Default: `.restore-test` next to the database. */
  scratchDir?: string;
  /** Free bytes of the file system holding `dir`. */
  freeBytes?: (dir: string) => Promise<number>;
  /** How often free space is re-checked while the copy exists. */
  watchMs?: number;
  availableMemory?: () => Promise<number>;
  checkCopy?: CopyChecker;
  /** Lock shared with the nightly backup. Default: next to the database. */
  lockPath?: string | undefined;
  /** Base wait (x1, x3, x6 per attempt) before restoring, so the last WAL frames are shipped. */
  settleMs?: number;
  now?: () => Date;
  attempts?: number;
  signal?: AbortSignal;
}

const defaultFreeBytes = async (dir: string) => {
  const fs = await statfs(dir);
  return fs.bavail * fs.bsize;
};

const fileSize = (path: string) =>
  stat(path).then(
    (s) => s.size,
    () => 0,
  );

const defaultScratch = (databasePath: string) => join(dirname(databasePath), '.restore-test');

/** Remove every restore-test folder. Only called while holding the lock: at most one run exists. */
async function sweepScratch(scratch: string) {
  for (const name of await readdir(scratch).catch(() => [] as string[]))
    if (name.startsWith(SCRATCH_PREFIX))
      await rm(join(scratch, name), { recursive: true, force: true }).catch(() => undefined);
}

/**
 * At process start: remove what a crash or restart left behind, regardless of age. Skipped while
 * another process (the operator command) holds the lock, because that run owns its folder.
 */
export async function sweepRestoreScratchAtStart(
  databasePath: string,
  scratchDir = defaultScratch(databasePath),
): Promise<void> {
  const release = await acquireMaintenanceLock(lockPathFor(databasePath)).catch(() => undefined);
  if (!release) return;
  try {
    await sweepScratch(scratchDir);
  } finally {
    await release().catch(() => undefined);
  }
}

/**
 * One restore test. Never throws for an expected failure; the copy is gone when it returns.
 * Holds the maintenance lock, so it never overlaps the nightly backup or a second restore test.
 */
export async function runRestoreTest(deps: RestoreTestDeps): Promise<RestoreTestOutcome> {
  const release = await acquireMaintenanceLock(
    'lockPath' in deps ? deps.lockPath : lockPathFor(deps.databasePath),
  ).catch(() => undefined);
  if (!release) return { status: 'skipped', backupName: null, reason: 'backup_running' };
  try {
    return await runLocked(deps);
  } finally {
    await release().catch(() => undefined);
  }
}

async function runLocked(deps: RestoreTestDeps): Promise<RestoreTestOutcome> {
  const signal = deps.signal ?? new AbortController().signal;
  const now = deps.now ?? (() => new Date());
  const freeBytes = deps.freeBytes ?? defaultFreeBytes;
  const scratch = deps.scratchDir ?? defaultScratch(deps.databasePath);
  try {
    await mkdir(scratch, { recursive: true, mode: 0o700 });
  } catch {
    return { status: 'failed', backupName: null, reason: 'restore_failed' };
  }
  await sweepScratch(scratch);

  // 1. The night copy: present and readable end to end (no decryption, no disk, constant memory).
  const client = deps.client ?? new S3Client(deps.config.s3);
  let key: string | undefined;
  try {
    key = latestArchiveKey(await client.list(deps.config.prefix), deps.config.prefix);
  } catch {
    return { status: 'failed', backupName: null, reason: 'storage_unavailable' };
  }
  if (!key) return { status: 'failed', backupName: null, reason: 'backup_missing' };
  const backupName = key.slice(deps.config.prefix.length);
  const day = backupDay(key);
  if (!day || now().getTime() - Date.parse(`${day}T00:00:00Z`) > (MAX_BACKUP_AGE_DAYS + 1) * DAY)
    return { status: 'failed', backupName, reason: 'backup_stale' };
  try {
    await client.verifyEncryptedObject(key, signal);
  } catch (error) {
    const invalid = error instanceof S3Error && error.code === 'InvalidResponse';
    return {
      status: 'failed',
      backupName,
      reason: invalid ? 'backup_unreadable' : 'storage_unavailable',
    };
  }

  // 2. Room and memory for the copy before anything is written: the copy plus the floor that must
  //    stay free, and enough available memory for the restore and the checker next to the server.
  const needed =
    Math.ceil(
      ((await fileSize(deps.databasePath)) + (await fileSize(`${deps.databasePath}-wal`))) *
        SPACE_FACTOR,
    ) + DISK_FLOOR_BYTES;
  if ((await freeBytes(scratch).catch(() => 0)) < needed)
    return { status: 'skipped', backupName, reason: 'not_enough_space' };
  const memory = await (deps.availableMemory ?? availableMemoryBytes)().catch(() => 0);
  if (memory < MEMORY_FLOOR_BYTES)
    return { status: 'skipped', backupName, reason: 'not_enough_memory' };

  // 3. Restore and compare. A write during the attempt, or one not yet shipped, repeats it.
  let last: RestoreTestOutcome = { status: 'skipped', backupName, reason: 'database_busy' };
  for (let attempt = 0; attempt < (deps.attempts ?? 3); attempt += 1) {
    let dir: string;
    try {
      dir = await mkdtemp(join(scratch, SCRATCH_PREFIX));
    } catch {
      return { status: 'failed', backupName, reason: 'restore_failed' };
    }
    // While the copy exists the volume must keep its floor: a growing WAL or Litestream itself
    // must never be starved. Falling below it stops the restore or the check and cleans up.
    const stop = new AbortController();
    let lowSpace = false;
    const watch = setInterval(() => {
      void freeBytes(scratch).then(
        (free) => {
          if (free < DISK_FLOOR_BYTES && !stop.signal.aborted) {
            lowSpace = true;
            stop.abort();
          }
        },
        () => undefined,
      );
    }, deps.watchMs ?? 1000);
    const work = AbortSignal.any([signal, stop.signal]);
    const belowFloor = async () =>
      lowSpace || (await freeBytes(scratch).catch(() => DISK_FLOOR_BYTES)) < DISK_FLOOR_BYTES;
    const skipped = (): RestoreTestOutcome => ({
      status: 'skipped',
      backupName,
      reason: 'not_enough_space',
    });
    try {
      await chmod(dir, 0o700);
      const before = await readFigures(deps.db);
      await sleep((deps.settleMs ?? 10_000) * (SETTLE_STEPS[attempt] ?? 6), undefined, {
        signal: work,
      }).catch(() => undefined);
      if (lowSpace) return skipped();
      const output = join(dir, 'budget.sqlite');
      let restored: 'restored' | 'missing';
      try {
        restored = await deps.restorer.restore(output, work);
      } catch {
        return lowSpace || (await belowFloor())
          ? skipped()
          : { status: 'failed', backupName, reason: 'restore_failed' };
      }
      if (restored === 'missing')
        return { status: 'failed', backupName, reason: 'replica_missing' };
      if (await belowFloor()) return skipped();

      let report: CopyReport;
      let copyBalances: Record<string, string>;
      try {
        report = await (deps.checkCopy ?? childCopyChecker)(output, work);
        if (report.intact) {
          const copy = openReadonlyDatabase(output);
          try {
            copyBalances = readBalances(copy.db);
          } finally {
            copy.close();
          }
        }
      } catch {
        return lowSpace || (await belowFloor())
          ? skipped()
          : { status: 'failed', backupName, reason: 'copy_corrupt' };
      }
      if (!report.intact) return { status: 'failed', backupName, reason: 'copy_corrupt' };

      const after = await readFigures(deps.db);
      const moved = differences(before, after);
      const diff = differences({ counts: report.counts, balances: copyBalances! }, before);
      if (moved.length === 0 && diff.length === 0) return { status: 'ok', backupName };
      last =
        moved.length > 0
          ? { status: 'skipped', backupName, reason: 'database_busy' }
          : { status: 'failed', backupName, reason: 'mismatch', differences: diff.slice(0, 5) };
    } finally {
      clearInterval(watch);
      await rm(dir, { recursive: true, force: true });
    }
  }
  return last;
}

/** Stored under `app_setting` (`backup.restore_test`): the last attempt and the last success. */
export interface RestoreTestState {
  checkedAt: string;
  status: RestoreTestOutcome['status'];
  backupName: string | null;
  reason?: RestoreTestReason;
  differences?: string[];
  lastOkAt?: string;
  /** First attempt ever: the overdue clock starts here until a test has passed. */
  firstCheckedAt: string;
  /** The overdue entry was opened once for this overdue period (reset by a success). */
  overdueReported?: boolean;
}

export function readRestoreTestState(db: Db): RestoreTestState | undefined {
  const value = db
    .select({ value: schema.appSetting.value })
    .from(schema.appSetting)
    .where(eq(schema.appSetting.id, RESTORE_TEST_SETTING))
    .get()?.value;
  if (!value) return undefined;
  try {
    const state = JSON.parse(value) as RestoreTestState;
    return typeof state.checkedAt === 'string' && typeof state.status === 'string'
      ? state
      : undefined;
  } catch {
    return undefined;
  }
}

const overdue = (state: RestoreTestState | undefined, now: Date) =>
  state !== undefined &&
  now.getTime() - Date.parse(state.lastOkAt ?? state.firstCheckedAt) >
    RESTORE_TEST_OVERDUE_DAYS * DAY;

export interface RestoreTestStatus {
  status: 'never' | RestoreTestOutcome['status'];
  checkedAt: string | null;
  backupName: string | null;
  /** Fixed German explanation for a failed or skipped test. */
  message: string | null;
  lastOkAt: string | null;
  /** No passed test for more than 40 days. */
  overdue: boolean;
}

/** What Einstellungen › Sicherung shows. */
export function restoreTestStatus(db: Db, now: Date): RestoreTestStatus {
  const state = readRestoreTestState(db);
  if (!state)
    return {
      status: 'never',
      checkedAt: null,
      backupName: null,
      message: null,
      lastOkAt: null,
      overdue: false,
    };
  return {
    status: state.status,
    checkedAt: state.checkedAt,
    backupName: state.backupName,
    message: restoreTestMessage(state),
    lastOkAt: state.lastOkAt ?? null,
    overdue: overdue(state, now),
  };
}

function openInboxItem(db: Db) {
  const { inboxItem } = schema;
  return db
    .select({ id: inboxItem.id })
    .from(inboxItem)
    .where(and(eq(inboxItem.refType, RESTORE_TEST_INBOX_REF), isNull(inboxItem.resolvedAt)))
    .get();
}

function reportInbox(db: Db, title: string, detail: string, now: Date) {
  if (openInboxItem(db)) return;
  db.insert(schema.inboxItem)
    .values({
      id: randomUUID(),
      kind: 'other',
      title,
      detail,
      refType: RESTORE_TEST_INBOX_REF,
      urgent: true,
      createdAt: now.toISOString(),
    })
    .run();
}

/**
 * An overdue test (no success for more than 40 days) gets one open entry under Konten › Prüfen,
 * unless a failure entry is already open. Best effort: skipped while an import holds the writes.
 */
export function reportOverdueRestoreTest(db: Db, now: Date): void {
  const state = readRestoreTestState(db);
  if (writesHeld(db) || !state || state.overdueReported || !overdue(state, now)) return;
  // Once per overdue period: an entry the owner resolved does not come back every 15 minutes.
  const value = JSON.stringify({ ...state, overdueReported: true });
  db.update(schema.appSetting)
    .set({ value })
    .where(eq(schema.appSetting.id, RESTORE_TEST_SETTING))
    .run();
  reportInbox(
    db,
    'Wiederherstellungsprobe überfällig',
    `Die letzte erfolgreiche Wiederherstellungsprobe liegt mehr als ${RESTORE_TEST_OVERDUE_DAYS} Tage zurück.`,
    now,
  );
}

/**
 * Store the result and keep Konten › Prüfen in step: a failure opens one entry, a success closes
 * it. System state, written without an audit entry (nothing the owner could undo).
 */
export function recordRestoreTest(db: Db, outcome: RestoreTestOutcome, now: Date): void {
  const previous = readRestoreTestState(db);
  const checkedAt = now.toISOString();
  const lastOkAt = outcome.status === 'ok' ? checkedAt : previous?.lastOkAt;
  const state: RestoreTestState = {
    checkedAt,
    status: outcome.status,
    backupName: outcome.backupName,
    ...(outcome.reason ? { reason: outcome.reason } : {}),
    ...(outcome.differences?.length ? { differences: outcome.differences } : {}),
    ...(lastOkAt ? { lastOkAt } : {}),
    firstCheckedAt: previous?.firstCheckedAt ?? checkedAt,
    ...(outcome.status !== 'ok' && previous?.overdueReported ? { overdueReported: true } : {}),
  };
  const value = JSON.stringify(state);
  db.transaction((tx) => {
    tx.insert(schema.appSetting)
      .values({ id: RESTORE_TEST_SETTING, value })
      .onConflictDoUpdate({ target: schema.appSetting.id, set: { value } })
      .run();
    if (outcome.status === 'ok')
      tx.update(schema.inboxItem)
        .set({ resolvedAt: checkedAt, resolution: 'Wiederherstellungsprobe wieder erfolgreich' })
        .where(
          and(
            eq(schema.inboxItem.refType, RESTORE_TEST_INBOX_REF),
            isNull(schema.inboxItem.resolvedAt),
          ),
        )
        .run();
  });
  if (outcome.status === 'failed')
    reportInbox(
      db,
      'Wiederherstellungsprobe fehlgeschlagen',
      restoreTestMessage(outcome) ?? '',
      now,
    );
  else reportOverdueRestoreTest(db, now);
}

/** One line for the server log or the operator terminal: status, file name, reason code. */
export const restoreTestLogLine = (outcome: RestoreTestOutcome) =>
  `Restore test ${outcome.status}: ${outcome.backupName ?? 'no backup'}${
    outcome.reason ? ` (${outcome.reason})` : ''
  }`;

/**
 * Monthly schedule: every check (15 min) between 03:00 and 06:00 UTC, after the night copy, runs
 * the test when no test has passed in the current UTC month. A failed or skipped test is repeated
 * on the following nights, at most once in 20 hours. State is in the database, so a restart
 * neither repeats nor forgets a test. Never throws; the app never waits for it.
 */
export class RestoreTestScheduler {
  private running = false;

  constructor(
    private readonly deps: {
      db: Db;
      run: () => Promise<RestoreTestOutcome>;
      log?: (message: string) => void;
    },
  ) {}

  due(now: Date): boolean {
    const hour = now.getUTCHours();
    if (hour < 3 || hour >= 6) return false;
    const state = readRestoreTestState(this.deps.db);
    if (!state) return true;
    if (state.lastOkAt?.slice(0, 7) === now.toISOString().slice(0, 7)) return false;
    const last = Date.parse(state.checkedAt);
    return Number.isNaN(last) || now.getTime() - last >= 20 * 3_600_000;
  }

  async tick(now = new Date()): Promise<RestoreTestOutcome | undefined> {
    const log = this.deps.log ?? console.log;
    try {
      reportOverdueRestoreTest(this.deps.db, now);
      if (this.running || writesHeld(this.deps.db) || !this.due(now)) return undefined;
      this.running = true;
      try {
        // An unexpected exception is a failed test like any other: recorded, so it is shown and
        // the 40-day clock keeps running (a silent crash every night must not look like health).
        const outcome = await this.deps.run().catch((): RestoreTestOutcome => ({
          status: 'failed',
          backupName: null,
          reason: 'restore_failed',
        }));
        // Nightly backup running: nothing happened, try again at the next check.
        if (outcome.reason === 'backup_running') return undefined;
        // An import may have started during the run: keep nothing half-done, retry at the next check.
        if (writesHeld(this.deps.db)) return undefined;
        recordRestoreTest(this.deps.db, outcome, now);
        log(restoreTestLogLine(outcome));
        return outcome;
      } finally {
        this.running = false;
      }
    } catch {
      // A locked database or an unexpected error: nothing recorded, the next check tries again.
      log('Restore test could not run or be recorded; will retry');
      return undefined;
    }
  }
}
