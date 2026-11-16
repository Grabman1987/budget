import { migrateDatabase, openDatabase, schema, holdWrites, releaseWrites } from '@budget/db';
import { seedDatabase } from '@budget/fixtures/seed';
import { eq } from 'drizzle-orm';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  rmSync,
  writeFileSync,
  writeSync,
  closeSync,
  statSync,
  utimesSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { encryptedBackupRoutes } from '../api/encrypted-backup';
import { BackupScheduler } from './backup';
import {
  DISK_FLOOR_BYTES,
  MEMORY_FLOOR_BYTES,
  childCopyChecker,
  RESTORE_TEST_INBOX_REF,
  RESTORE_TEST_SETTING,
  RestoreTestScheduler,
  litestreamRestorer,
  readRestoreTestState,
  recordRestoreTest,
  reportOverdueRestoreTest,
  replicationEnabled,
  restoreTestLogLine,
  restoreTestStatus,
  runRestoreTest,
  sweepRestoreScratchAtStart,
  type RestoreTestDeps,
  type Restorer,
} from './restore-test';

/**
 * Restore test against a synthetic ledger (fixtures only). Storage is a local fake S3 endpoint;
 * the restore itself is a stand-in that copies the live database the way Litestream would, so
 * every outcome (ok, corrupt, missing, no space) is reproducible without a cloud. One further
 * test drives the real pinned Litestream binary when LITESTREAM_BIN points to it.
 */
const SECRET = 'test-secret-never-in-results';
const CIPHERTEXT = Buffer.from(`age-encryption.org/v1\n-> synthetic night copy ${'x'.repeat(200)}`);

function fakeS3() {
  const objects = new Map<string, { body: Buffer; etag: string }>();
  const md5 = (body: Buffer) => createHash('md5').update(body).digest('hex');
  const server: Server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.searchParams.get('list-type') === '2') {
        const prefix = url.searchParams.get('prefix') ?? '';
        const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
        return void res
          .writeHead(200)
          .end(
            `<ListBucketResult><IsTruncated>false</IsTruncated>${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}</ListBucketResult>`,
          );
      }
      const found = objects.get(decodeURIComponent(url.pathname.split('/').slice(2).join('/')));
      if (!found) return void res.writeHead(404).end();
      res
        .writeHead(200, { 'content-length': String(found.body.length), etag: `"${found.etag}"` })
        .end(found.body);
    });
  });
  return {
    server,
    clear: () => objects.clear(),
    put: (key: string, body: Buffer, etag = md5(body)) => objects.set(key, { body, etag }),
    endpoint: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  };
}

const s3 = fakeS3();
const work = mkdtempSync(join(tmpdir(), 'budget-restore-test-suite-'));
let scratch: string;
let live: ReturnType<typeof openDatabase>;
let livePath: string;
let config: RestoreTestDeps['config'];

beforeAll(async () => {
  await new Promise<void>((resolve) => s3.server.listen(0, '127.0.0.1', resolve));
  config = {
    prefix: 'encrypted/',
    s3: {
      endpoint: s3.endpoint(),
      bucket: 'test-bucket',
      accessKeyId: 'test-key',
      secretAccessKey: SECRET,
      region: 'auto',
    },
  };
});

beforeEach(() => {
  const dir = mkdtempSync(join(work, 'case-'));
  scratch = join(dir, 'scratch');
  mkdirSync(scratch);
  livePath = join(dir, 'budget.sqlite');
  live = openDatabase(livePath);
  migrateDatabase(live.db);
  seedDatabase(live.db);
  s3.clear();
  s3.put('encrypted/budget-2026-11-13.tar.age', CIPHERTEXT);
  s3.put('encrypted/budget-2026-11-14.tar.age', CIPHERTEXT);
});

afterEach(() => {
  if (live.sqlite.open) live.close();
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    s3.server.close((error) => (error ? reject(error) : resolve())),
  );
  rmSync(work, { recursive: true, force: true });
});

/** Stand-in for `litestream restore`: a consistent copy of the live database. */
const copyRestorer = (after?: (output: string) => void): Restorer & { calls: number } => ({
  calls: 0,
  async restore(output) {
    this.calls += 1;
    live.sqlite.prepare('VACUUM INTO ?').run(output);
    after?.(output);
    return 'restored';
  },
});

const deps = (restorer: Restorer, extra: Partial<RestoreTestDeps> = {}): RestoreTestDeps => ({
  db: live.db,
  databasePath: livePath,
  config,
  restorer,
  scratchDir: scratch,
  settleMs: 0,
  availableMemory: () => Promise.resolve(2 * 1024 ** 3),
  now: () => new Date('2026-11-15T03:00:00Z'),
  ...extra,
});

const leftovers = () => readdirSync(scratch);

const addAccount = () =>
  live.sqlite.exec(
    "INSERT INTO inbox_item (id, kind, title) VALUES (lower(hex(randomblob(8))), 'other', 'Synthetic extra row')",
  );

describe('runRestoreTest', () => {
  it('passes when the restored copy matches the live database, and removes the copy', async () => {
    const restorer = copyRestorer();
    const outcome = await runRestoreTest(deps(restorer));
    expect(outcome).toEqual({ status: 'ok', backupName: 'budget-2026-11-14.tar.age' });
    expect(restorer.calls).toBe(1);
    expect(leftovers()).toEqual([]);
  });

  it('never writes to the live database', async () => {
    const before = live.sqlite.pragma('data_version', { simple: true });
    const total = live.sqlite.prepare('SELECT total_changes()').pluck().get();
    await runRestoreTest(deps(copyRestorer()));
    expect(live.sqlite.prepare('SELECT total_changes()').pluck().get()).toBe(total);
    expect(live.sqlite.pragma('data_version', { simple: true })).toBe(before);
  });

  it('fails on a corrupted restored copy and still removes it', async () => {
    const corrupt = copyRestorer((output) => {
      // Overwrite pages in the middle of the file: the header stays valid, the content does not.
      const fd = openSync(output, 'r+');
      const size = statSync(output).size;
      writeSync(fd, Buffer.alloc(Math.floor(size / 2), 0xa5), 0, Math.floor(size / 2), 4096);
      closeSync(fd);
    });
    expect(await runRestoreTest(deps(corrupt))).toEqual({
      status: 'failed',
      backupName: 'budget-2026-11-14.tar.age',
      reason: 'copy_corrupt',
    });
    const garbage = copyRestorer((output) => writeFileSync(output, 'not a database'));
    expect((await runRestoreTest(deps(garbage))).reason).toBe('copy_corrupt');
    expect(leftovers()).toEqual([]);
  });

  it('fails on a night copy whose ciphertext does not match its checksum or header', async () => {
    const restorer = copyRestorer();
    s3.put('encrypted/budget-2026-11-14.tar.age', CIPHERTEXT, 'f'.repeat(32));
    expect(await runRestoreTest(deps(restorer))).toEqual({
      status: 'failed',
      backupName: 'budget-2026-11-14.tar.age',
      reason: 'backup_unreadable',
    });
    s3.put('encrypted/budget-2026-11-14.tar.age', Buffer.alloc(300, 1));
    expect((await runRestoreTest(deps(restorer))).reason).toBe('backup_unreadable');
    expect(restorer.calls).toBe(0);
    expect(leftovers()).toEqual([]);
  });

  it('fails when the newest night copy is stale', async () => {
    const restorer = copyRestorer();
    const outcome = await runRestoreTest(
      deps(restorer, { now: () => new Date('2026-11-20T03:00:00Z') }),
    );
    expect(outcome).toEqual({
      status: 'failed',
      backupName: 'budget-2026-11-14.tar.age',
      reason: 'backup_stale',
    });
    expect(restorer.calls).toBe(0);
  });

  it('works next to the database by default', async () => {
    const own = { ...deps(copyRestorer()) } as RestoreTestDeps;
    delete (own as { scratchDir?: string }).scratchDir;
    expect((await runRestoreTest(own)).status).toBe('ok');
    expect(readdirSync(join(livePath, '..', '.restore-test'))).toEqual([]);
  });

  it('fails when there is no night copy, no replica, or the storage does not answer', async () => {
    const restorer = copyRestorer();
    s3.clear();
    s3.put('encrypted/budget-2026-11-14.tar.age.partial', CIPHERTEXT);
    expect(await runRestoreTest(deps(restorer))).toEqual({
      status: 'failed',
      backupName: null,
      reason: 'backup_missing',
    });
    expect(restorer.calls).toBe(0);

    s3.put('encrypted/budget-2026-11-14.tar.age', CIPHERTEXT);
    const missing: Restorer = { restore: () => Promise.resolve('missing') };
    expect((await runRestoreTest(deps(missing))).reason).toBe('replica_missing');
    const broken: Restorer = { restore: () => Promise.reject(new Error(`boom ${SECRET}`)) };
    expect(await runRestoreTest(deps(broken))).toEqual({
      status: 'failed',
      backupName: 'budget-2026-11-14.tar.age',
      reason: 'restore_failed',
    });

    const offline = { ...config, s3: { ...config.s3, endpoint: 'http://127.0.0.1:1' } };
    expect(await runRestoreTest(deps(restorer, { config: offline }))).toEqual({
      status: 'failed',
      backupName: null,
      reason: 'storage_unavailable',
    });
    expect(leftovers()).toEqual([]);
  });

  it('skips without writing anything when free space is short', async () => {
    const restorer = copyRestorer();
    const size = statSync(livePath).size;
    const outcome = await runRestoreTest(
      deps(restorer, { freeBytes: () => Promise.resolve(DISK_FLOOR_BYTES) }),
    );
    expect(outcome).toEqual({
      status: 'skipped',
      backupName: 'budget-2026-11-14.tar.age',
      reason: 'not_enough_space',
    });
    expect(restorer.calls).toBe(0);
    expect(leftovers()).toEqual([]);
    // Just enough room ((database + WAL) x 1.05 plus the 150 MiB floor) lets it run.
    const wal = existsSync(`${livePath}-wal`) ? statSync(`${livePath}-wal`).size : 0;
    const enough = Math.ceil((size + wal) * 1.05) + DISK_FLOOR_BYTES + 4 * 1_048_576;
    expect(
      (await runRestoreTest(deps(restorer, { freeBytes: () => Promise.resolve(enough) }))).status,
    ).toBe('ok');
  });

  it('reports a copy that lags behind as a mismatch, naming tables but no values', async () => {
    const stale = join(work, `stale-${Math.random().toString(36).slice(2)}.sqlite`);
    live.sqlite.prepare('VACUUM INTO ?').run(stale);
    addAccount();
    live.sqlite.exec(
      "UPDATE account SET opening_balance_cents = opening_balance_cents + 1 WHERE id = (SELECT id FROM account WHERE deleted_at IS NULL AND opening_date <= date('now') LIMIT 1)",
    );
    const restorer: Restorer & { calls: number } = {
      calls: 0,
      async restore(output) {
        this.calls += 1;
        const copy = openDatabase(stale);
        copy.sqlite.pragma('journal_mode = DELETE');
        copy.sqlite.prepare('VACUUM INTO ?').run(output);
        copy.close();
        return 'restored';
      },
    };
    expect(await runRestoreTest(deps(restorer))).toEqual({
      status: 'failed',
      backupName: 'budget-2026-11-14.tar.age',
      reason: 'mismatch',
      differences: ['inbox_item', 'account balances'],
    });
    expect(restorer.calls).toBe(3);
    expect(leftovers()).toEqual([]);
  });

  it('retries when the database changes during the test, then gives up as skipped', async () => {
    let writes = 1;
    const restorer = copyRestorer(() => {
      if (writes-- > 0) addAccount();
    });
    expect((await runRestoreTest(deps(restorer))).status).toBe('ok');
    expect(restorer.calls).toBe(2);

    const always = copyRestorer(() => addAccount());
    expect(await runRestoreTest(deps(always))).toEqual({
      status: 'skipped',
      backupName: 'budget-2026-11-14.tar.age',
      reason: 'database_busy',
    });
    expect(always.calls).toBe(3);
    expect(leftovers()).toEqual([]);
  });

  it('sweeps every folder left behind by a killed run, whatever its age', async () => {
    for (const name of ['budget-restore-test-old', 'budget-restore-test-fresh']) {
      mkdirSync(join(scratch, name));
      writeFileSync(join(scratch, name, 'budget.sqlite'), 'left over');
    }
    const old = new Date('2026-11-01T00:00:00Z');
    utimesSync(join(scratch, 'budget-restore-test-old'), old, old);
    writeFileSync(join(scratch, 'unrelated.txt'), 'keep');
    await runRestoreTest(deps(copyRestorer()));
    expect(leftovers()).toEqual(['unrelated.txt']);
  });

  it('sweeps at process start, but not while another process holds the lock', async () => {
    mkdirSync(join(scratch, 'budget-restore-test-crashed'));
    const lock = join(livePath, '..', '.maintenance.lock');
    writeFileSync(lock, `${process.pid} ${Date.now()}`);
    await sweepRestoreScratchAtStart(livePath, scratch);
    expect(leftovers()).toEqual(['budget-restore-test-crashed']);
    rmSync(lock);
    await sweepRestoreScratchAtStart(livePath, scratch);
    expect(leftovers()).toEqual([]);
    expect(existsSync(lock)).toBe(false);
  });

  it('does not overlap a running backup or a second test, and gives the lock back', async () => {
    const lock = join(livePath, '..', '.maintenance.lock');
    writeFileSync(lock, `${process.pid} ${Date.now()}`);
    const restorer = copyRestorer();
    expect(await runRestoreTest(deps(restorer))).toEqual({
      status: 'skipped',
      backupName: null,
      reason: 'backup_running',
    });
    expect(restorer.calls).toBe(0);
    expect(existsSync(lock)).toBe(true);
    rmSync(lock);
    expect((await runRestoreTest(deps(restorer))).status).toBe('ok');
    expect(existsSync(lock)).toBe(false);
    // Also released after a failure.
    await runRestoreTest(deps({ restore: () => Promise.reject(new Error('x')) }));
    expect(existsSync(lock)).toBe(false);
  });

  it('skips with a recorded reason when available memory is below the floor', async () => {
    const restorer = copyRestorer();
    expect(
      await runRestoreTest(
        deps(restorer, { availableMemory: () => Promise.resolve(MEMORY_FLOOR_BYTES - 1) }),
      ),
    ).toEqual({
      status: 'skipped',
      backupName: 'budget-2026-11-14.tar.age',
      reason: 'not_enough_memory',
    });
    expect(restorer.calls).toBe(0);
    expect(leftovers()).toEqual([]);
  });

  it('aborts the restore and cleans up when free space falls under the floor meanwhile', async () => {
    let polls = 0;
    const partial: Restorer = {
      async restore(output, signal) {
        writeFileSync(output, 'partial copy');
        await new Promise((_resolve, reject) =>
          signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        );
        return 'restored';
      },
    };
    const outcome = await runRestoreTest(
      deps(partial, {
        watchMs: 5,
        // Plenty for the first check, then the volume fills up (a growing WAL, for example).
        freeBytes: () => Promise.resolve(polls++ < 1 ? 10 * 1024 ** 3 : DISK_FLOOR_BYTES - 1),
      }),
    );
    expect(outcome).toEqual({
      status: 'skipped',
      backupName: 'budget-2026-11-14.tar.age',
      reason: 'not_enough_space',
    });
    expect(leftovers()).toEqual([]);
  });

  it('re-checks the floor after the restore and does not check a copy it cannot afford', async () => {
    let restored = false;
    let checked = false;
    const outcome = await runRestoreTest(
      deps(
        {
          async restore(output) {
            live.sqlite.prepare('VACUUM INTO ?').run(output);
            restored = true;
            return 'restored';
          },
        },
        {
          watchMs: 60_000,
          freeBytes: () => Promise.resolve(restored ? DISK_FLOOR_BYTES - 1 : 10 * 1024 ** 3),
          checkCopy: () => {
            checked = true;
            return Promise.reject(new Error('must not run'));
          },
        },
      ),
    );
    expect(outcome.reason).toBe('not_enough_space');
    expect(checked).toBe(false);
    expect(leftovers()).toEqual([]);
  });

  it('checks the copy in a child process with its own read-only connection', async () => {
    const copy = join(scratch, 'copy.sqlite');
    live.sqlite.prepare('VACUUM INTO ?').run(copy);
    const report = await childCopyChecker(copy, new AbortController().signal);
    expect(report.intact).toBe(true);
    expect(report.counts['account']).toBeGreaterThan(0);
    expect(Object.keys(report.counts)).not.toContain('sqlite_sequence');
    writeFileSync(copy, 'not a database');
    await expect(childCopyChecker(copy, new AbortController().signal)).rejects.toThrow();
    const stop = new AbortController();
    stop.abort();
    await expect(childCopyChecker(copy, stop.signal)).rejects.toThrow();
    rmSync(copy);
  });
});

describe('result, Konten › Prüfen and Einstellungen › Sicherung', () => {
  const openItems = () =>
    live.db
      .select()
      .from(schema.inboxItem)
      .where(eq(schema.inboxItem.refType, RESTORE_TEST_INBOX_REF))
      .all()
      .filter((item) => item.resolvedAt === null);

  it('stores the result, opens one entry on failure and resolves it on success', () => {
    expect(restoreTestStatus(live.db, new Date('2026-11-15T03:00:00Z')).status).toBe('never');
    const failed = {
      status: 'failed',
      backupName: 'budget-2026-11-14.tar.age',
      reason: 'copy_corrupt',
    } as const;
    recordRestoreTest(live.db, failed, new Date('2026-11-15T03:15:00Z'));
    recordRestoreTest(live.db, failed, new Date('2026-11-16T03:15:00Z'));
    expect(openItems()).toHaveLength(1);
    expect(openItems()[0]).toMatchObject({
      title: 'Wiederherstellungsprobe fehlgeschlagen',
      detail: 'Die wiederhergestellte Prüfkopie hat die Integritätsprüfung nicht bestanden.',
      urgent: true,
    });
    expect(restoreTestStatus(live.db, new Date('2026-11-16T04:00:00Z'))).toEqual({
      status: 'failed',
      checkedAt: '2026-11-16T03:15:00.000Z',
      backupName: 'budget-2026-11-14.tar.age',
      message: 'Die wiederhergestellte Prüfkopie hat die Integritätsprüfung nicht bestanden.',
      lastOkAt: null,
      overdue: false,
    });

    recordRestoreTest(
      live.db,
      { status: 'ok', backupName: 'budget-2026-11-16.tar.age' },
      new Date('2026-11-17T03:15:00Z'),
    );
    expect(openItems()).toEqual([]);
    expect(restoreTestStatus(live.db, new Date('2026-11-17T04:00:00Z'))).toEqual({
      status: 'ok',
      checkedAt: '2026-11-17T03:15:00.000Z',
      backupName: 'budget-2026-11-16.tar.age',
      message: null,
      lastOkAt: '2026-11-17T03:15:00.000Z',
      overdue: false,
    });
    // System state: no audit entry, so nothing appears under Rückgängig.
    expect(
      live.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.entityId, RESTORE_TEST_SETTING))
        .all(),
    ).toEqual([]);
  });

  it('opens an entry when no test has passed for more than 40 days', () => {
    recordRestoreTest(
      live.db,
      { status: 'ok', backupName: 'budget-2026-10-01.tar.age' },
      new Date('2026-10-01T03:15:00Z'),
    );
    const skipped = {
      status: 'skipped',
      backupName: 'budget-2026-11-09.tar.age',
      reason: 'not_enough_space',
    } as const;
    recordRestoreTest(live.db, skipped, new Date('2026-11-09T03:15:00Z'));
    expect(openItems()).toEqual([]);
    expect(restoreTestStatus(live.db, new Date('2026-11-09T04:00:00Z')).overdue).toBe(false);

    recordRestoreTest(live.db, skipped, new Date('2026-11-11T03:15:00Z'));
    expect(openItems()).toHaveLength(1);
    expect(openItems()[0]).toMatchObject({
      title: 'Wiederherstellungsprobe überfällig',
      detail: 'Die letzte erfolgreiche Wiederherstellungsprobe liegt mehr als 40 Tage zurück.',
    });
    expect(restoreTestStatus(live.db, new Date('2026-11-11T04:00:00Z'))).toMatchObject({
      status: 'skipped',
      overdue: true,
      lastOkAt: '2026-10-01T03:15:00.000Z',
      message: 'Zu wenig freier Speicherplatz für die Prüfkopie. Die Probe wurde ausgelassen.',
    });
  });

  it('serves the status without storage details and keeps secrets out of results and logs', async () => {
    const broken: Restorer = { restore: () => Promise.reject(new Error(`boom ${SECRET}`)) };
    const outcome = await runRestoreTest(deps(broken));
    recordRestoreTest(live.db, outcome, new Date('2026-11-15T03:15:00Z'));
    const api = encryptedBackupRoutes(live.db, async (_c, next) => next());
    const response = await api.request('/restore-test');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({
      status: 'failed',
      backupName: 'budget-2026-11-14.tar.age',
      message: 'Die Wiederherstellung in eine Prüfkopie ist fehlgeschlagen.',
    });
    const stored = live.db
      .select()
      .from(schema.appSetting)
      .where(eq(schema.appSetting.id, RESTORE_TEST_SETTING))
      .get()?.value;
    const inbox = JSON.stringify(live.db.select().from(schema.inboxItem).all());
    for (const text of [body, stored ?? '', inbox, restoreTestLogLine(outcome)]) {
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain('test-key');
      expect(text).not.toContain('127.0.0.1');
      expect(text).not.toContain('boom');
    }
    expect(restoreTestLogLine(outcome)).toBe(
      'Restore test failed: budget-2026-11-14.tar.age (restore_failed)',
    );
  });
});

describe('nightly backup coordination', () => {
  it('the backup waits while the restore test holds the lock, and releases it afterwards', async () => {
    const backupConfig = {
      recipients: [],
      s3: config.s3,
      prefix: 'encrypted/',
      ageBin: '/nonexistent/age',
    };
    const lock = join(livePath, '..', '.maintenance.lock');
    const logs: string[] = [];
    const backup = new BackupScheduler({
      sqlite: live.sqlite,
      db: live.db,
      config: backupConfig,
      log: (line) => logs.push(line),
    });
    const night = new Date('2026-11-16T03:00:00Z');
    writeFileSync(lock, `${process.pid} ${Date.now()}`);
    expect(await backup.tick(night)).toBeUndefined();
    expect(logs).toEqual([]);
    rmSync(lock);
    // Without the lock the run starts (and fails here on purpose: no age binary), then frees it.
    expect(await backup.tick(night)).toBeUndefined();
    expect(logs).toHaveLength(1);
    expect(existsSync(lock)).toBe(false);
  });
});

describe('RestoreTestScheduler', () => {
  const scheduler = (run = () => runRestoreTest(deps(copyRestorer()))) => {
    const lines: string[] = [];
    let runs = 0;
    const instance = new RestoreTestScheduler({
      db: live.db,
      run: () => {
        runs += 1;
        return run();
      },
      log: (line) => lines.push(line),
    });
    return { instance, lines, runs: () => runs };
  };

  it('runs once a month at night and not again after a success', async () => {
    const s = scheduler();
    expect(await s.instance.tick(new Date('2026-11-15T12:00:00Z'))).toBeUndefined();
    expect((await s.instance.tick(new Date('2026-11-16T03:15:00Z')))?.status).toBe('ok');
    expect(await s.instance.tick(new Date('2026-11-17T03:15:00Z'))).toBeUndefined();
    expect(await s.instance.tick(new Date('2026-11-30T03:15:00Z'))).toBeUndefined();
    expect((await s.instance.tick(new Date('2026-12-01T03:15:00Z')))?.status).toBe('ok');
    expect(s.runs()).toBe(2);
    expect(s.lines).toEqual([
      'Restore test ok: budget-2026-11-14.tar.age',
      'Restore test ok: budget-2026-11-14.tar.age',
    ]);
    expect(readRestoreTestState(live.db)?.lastOkAt).toBe('2026-12-01T03:15:00.000Z');
  });

  it('repeats a failed test the next night, not within the same night', async () => {
    let fail = true;
    const s = scheduler(() =>
      runRestoreTest(
        deps(fail ? { restore: () => Promise.reject(new Error('down')) } : copyRestorer()),
      ),
    );
    expect((await s.instance.tick(new Date('2026-11-16T03:15:00Z')))?.reason).toBe(
      'restore_failed',
    );
    expect(await s.instance.tick(new Date('2026-11-16T03:30:00Z'))).toBeUndefined();
    fail = false;
    expect((await s.instance.tick(new Date('2026-11-17T03:15:00Z')))?.status).toBe('ok');
    expect(s.runs()).toBe(2);
  });

  it('does not record or log a run that found the nightly backup running', async () => {
    const s = scheduler(() =>
      Promise.resolve({ status: 'skipped', backupName: null, reason: 'backup_running' }),
    );
    expect(await s.instance.tick(new Date('2026-11-16T03:15:00Z'))).toBeUndefined();
    expect(s.runs()).toBe(1);
    expect(s.lines).toEqual([]);
    expect(readRestoreTestState(live.db)).toBeUndefined();
    expect(s.instance.due(new Date('2026-11-16T03:30:00Z'))).toBe(true);
  });

  it('records an unexpected exception as a failed test and waits while an import holds writes', async () => {
    const s = scheduler(() => Promise.reject(new Error(`unexpected ${SECRET}`)));
    holdWrites(live.db);
    expect(await s.instance.tick(new Date('2026-11-16T03:15:00Z'))).toBeUndefined();
    expect(s.runs()).toBe(0);
    releaseWrites(live.db);
    expect(await s.instance.tick(new Date('2026-11-16T03:30:00Z'))).toMatchObject({
      status: 'failed',
      reason: 'restore_failed',
    });
    expect(readRestoreTestState(live.db)?.status).toBe('failed');
    expect(JSON.stringify(readRestoreTestState(live.db))).not.toContain(SECRET);
    expect(s.lines).toEqual(['Restore test failed: no backup (restore_failed)']);
  });

  it('opens the overdue entry once per overdue period, not after every resolve', () => {
    recordRestoreTest(
      live.db,
      { status: 'ok', backupName: 'budget-2026-10-01.tar.age' },
      new Date('2026-10-01T03:15:00Z'),
    );
    const late = new Date('2026-11-12T03:15:00Z');
    reportOverdueRestoreTest(live.db, late);
    live.sqlite.exec(
      "UPDATE inbox_item SET resolved_at = '2026-11-12T04:00:00Z' WHERE ref_type = 'restore_test'",
    );
    reportOverdueRestoreTest(live.db, new Date('2026-11-12T03:30:00Z'));
    expect(
      live.db
        .select()
        .from(schema.inboxItem)
        .where(eq(schema.inboxItem.refType, RESTORE_TEST_INBOX_REF))
        .all(),
    ).toHaveLength(1);
    recordRestoreTest(
      live.db,
      { status: 'ok', backupName: 'budget-2026-11-14.tar.age' },
      new Date('2026-11-15T03:15:00Z'),
    );
    expect(readRestoreTestState(live.db)?.overdueReported).toBeUndefined();
  });
});

it('follows the entrypoint for whether replication is on', () => {
  expect(replicationEnabled({ BUDGET_REPLICATE: '1' })).toBe(true);
  expect(replicationEnabled({ BUCKET_NAME: 'bucket' })).toBe(true);
  expect(replicationEnabled({ BUDGET_REPLICATE: '0', BUCKET_NAME: 'bucket' })).toBe(false);
  expect(replicationEnabled({})).toBe(false);
});

/**
 * The real restore path: the pinned Litestream binary replicates the synthetic ledger to a file
 * replica and `litestreamRestorer` restores it. Runs where LITESTREAM_BIN is set (the binary is
 * not part of the unit-test image); the stand-in above covers the outcomes everywhere else.
 */
describe.runIf(Boolean(process.env['LITESTREAM_BIN']))('with the Litestream binary', () => {
  const bin = process.env['LITESTREAM_BIN'] as string;

  it('restores the replica, passes, and reports a missing replica', async () => {
    const replica = join(work, `replica-${Math.random().toString(36).slice(2)}`);
    mkdirSync(replica);
    const configFile = join(replica, 'litestream.yml');
    writeFileSync(
      configFile,
      `dbs:\n  - path: ${livePath}\n    replica:\n      type: file\n      path: ${join(replica, 'data')}\n`,
    );
    const restorer = litestreamRestorer({ databasePath: livePath, bin, config: configFile });
    expect((await runRestoreTest(deps(restorer))).reason).toBe('replica_missing');

    execFileSync(bin, ['replicate', '-once', '-config', configFile], { stdio: 'ignore' });
    expect(await runRestoreTest(deps(restorer))).toEqual({
      status: 'ok',
      backupName: 'budget-2026-11-14.tar.age',
    });

    // A write that was never replicated is found as a difference.
    addAccount();
    expect(await runRestoreTest(deps(restorer, { attempts: 1 }))).toMatchObject({
      status: 'failed',
      reason: 'mismatch',
      differences: ['inbox_item'],
    });
    expect(leftovers()).toEqual([]);
    expect(existsSync(livePath)).toBe(true);
  });
});
