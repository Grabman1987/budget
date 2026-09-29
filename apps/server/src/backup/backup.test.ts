import { migrateDatabase, openDatabase, schema } from '@budget/db';
import { seedDatabase } from '@budget/fixtures/seed';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BackupScheduler, backupConfigFromEnv, runBackup, type BackupConfig } from './backup';
import { backupKey } from './retention';
import { S3Client } from './s3';

/**
 * Restore test of the encrypted backup: a throwaway age key pair is generated for the test only
 * (the owner's real key never exists outside their offline storage), the backup is uploaded to a
 * local fake S3 endpoint, downloaded, decrypted and checked with PRAGMA integrity_check.
 * CI sets BUDGET_REQUIRE_AGE=1 so a missing age binary fails instead of skipping.
 */
const hasAge = (() => {
  try {
    execFileSync('age', ['--version']);
    execFileSync('age-keygen', ['--help'], { stdio: 'ignore' });
    return true;
  } catch {
    return process.env['BUDGET_REQUIRE_AGE'] === '1'
      ? (() => {
          throw new Error('BUDGET_REQUIRE_AGE=1 but age/age-keygen are not installed');
        })()
      : false;
  }
})();

/** In-memory S3: PUT, GET, DELETE and ListObjectsV2 on path-style URLs; requires a SigV4 header. */
function fakeS3() {
  const objects = new Map<string, Buffer>();
  let failPuts = false;
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      if (!String(req.headers.authorization).startsWith('AWS4-HMAC-SHA256 Credential=test-key/')) {
        res.writeHead(403).end('<Error><Code>AccessDenied</Code></Error>');
        return;
      }
      const url = new URL(req.url ?? '/', 'http://x');
      const [, bucket, ...rest] = url.pathname.split('/');
      const key = decodeURIComponent(rest.join('/'));
      if (bucket !== 'test-bucket')
        return void res.writeHead(404).end('<Error><Code>NoSuchBucket</Code></Error>');
      if (req.method === 'PUT') {
        if (failPuts)
          return void res.writeHead(500).end('<Error><Code>InternalError</Code></Error>');
        objects.set(key, Buffer.concat(chunks));
        return void res.writeHead(200).end();
      }
      if (req.method === 'DELETE') {
        objects.delete(key);
        return void res.writeHead(204).end();
      }
      if (req.method === 'GET' && url.searchParams.get('list-type') === '2') {
        const prefix = url.searchParams.get('prefix') ?? '';
        const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
        const body = `<ListBucketResult><IsTruncated>false</IsTruncated>${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}</ListBucketResult>`;
        return void res.writeHead(200, { 'content-type': 'application/xml' }).end(body);
      }
      if (req.method === 'GET') {
        const found = objects.get(key);
        return found ? void res.writeHead(200).end(found) : void res.writeHead(404).end();
      }
      res.writeHead(405).end();
    });
  });
  return {
    objects,
    server,
    setFailPuts: (v: boolean) => (failPuts = v),
    endpoint: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  };
}

const s3 = fakeS3();
const work = mkdtempSync(join(tmpdir(), 'budget-backup-test-'));
let config: BackupConfig;
let identity: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => s3.server.listen(0, '127.0.0.1', resolve));
  let recipient = `age1${'q'.repeat(58)}`;
  if (hasAge) {
    identity = join(work, 'test-key.txt');
    execFileSync('age-keygen', ['-o', identity], { stdio: 'ignore' });
    recipient = /public key: (age1\w+)/.exec(readFileSync(identity, 'utf8'))?.[1] as string;
  }
  config = backupConfigFromEnv({
    BUDGET_BACKUP_RECIPIENT: recipient,
    BUCKET_NAME: 'test-bucket',
    AWS_ENDPOINT_URL_S3: s3.endpoint(),
    AWS_ACCESS_KEY_ID: 'test-key',
    AWS_SECRET_ACCESS_KEY: 'test-secret',
  }) as BackupConfig;
});

afterAll(() => {
  s3.server.close();
  rmSync(work, { recursive: true, force: true });
});

function seededDatabase() {
  const file = join(work, `live-${Math.random().toString(36).slice(2)}.sqlite`);
  const opened = openDatabase(file);
  migrateDatabase(opened.db);
  seedDatabase(opened.db);
  return opened;
}

const tableCounts = (sqlite: ReturnType<typeof openDatabase>['sqlite']) =>
  Object.fromEntries(
    (
      sqlite
        .prepare("select name from sqlite_master where type = 'table' order by name")
        .pluck()
        .all() as string[]
    ).map((t) => [t, sqlite.prepare(`select count(*) from "${t}"`).pluck().get()]),
  );

describe.skipIf(!hasAge)('encrypted backup round trip (test key)', () => {
  it('uploads an age file that only the private key opens and that restores the full database', async () => {
    const live = seededDatabase();
    const now = new Date('2026-10-01T02:15:00Z');
    const result = await runBackup(live.sqlite, config, now, new S3Client(config.s3));
    expect(result.key).toBe('encrypted/budget-2026-10-01.sqlite.age');

    // Download (as the owner would) and look at it: an age file, no SQLite header in clear.
    const sealed = s3.objects.get(result.key) as Buffer;
    expect(sealed.length).toBe(result.bytes);
    expect(sealed.subarray(0, 21).toString()).toBe('age-encryption.org/v1');
    expect(sealed.includes(Buffer.from('SQLite format 3'))).toBe(false);

    const downloaded = join(work, 'downloaded.sqlite.age');
    const restored = join(work, 'restored.sqlite');
    writeFileSync(downloaded, sealed);
    execFileSync('age', ['--decrypt', '-i', identity, '-o', restored, downloaded]);
    const copy = openDatabase(restored);
    expect(copy.sqlite.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(tableCounts(copy.sqlite)).toEqual(tableCounts(live.sqlite));
    expect(Number(tableCounts(copy.sqlite)['booking'])).toBeGreaterThan(100);
    copy.close();

    // Another key cannot decrypt it.
    const stranger = join(work, 'stranger.txt');
    execFileSync('age-keygen', ['-o', stranger], { stdio: 'ignore' });
    expect(() =>
      execFileSync('age', ['--decrypt', '-i', stranger, downloaded], { stdio: 'pipe' }),
    ).toThrow();
    live.close();
  });

  it('keeps 30 daily and 12 monthly copies and leaves other keys alone', async () => {
    s3.objects.clear();
    s3.objects.set('budget.sqlite/0000/snapshot.ltx', Buffer.from('litestream'));
    const start = Date.parse('2025-01-01T00:00:00Z');
    for (let d = 0; d < 500; d++) {
      const day = new Date(start + d * 86_400_000).toISOString().slice(0, 10);
      s3.objects.set(backupKey('encrypted/', day), Buffer.from('old'));
    }
    const live = seededDatabase();
    const result = await runBackup(
      live.sqlite,
      config,
      new Date(start + 500 * 86_400_000),
      new S3Client(config.s3),
    );
    live.close();
    const left = [...s3.objects.keys()].filter((k) => k.startsWith('encrypted/'));
    // 30 newest days (Apr 17 - May 16 2026) plus the first of 12 months, overlapping in May.
    expect(left).toHaveLength(30 + 11);
    expect(result.deleted).toHaveLength(501 - left.length);
    expect(s3.objects.has('budget.sqlite/0000/snapshot.ltx')).toBe(true);
    expect(left).toContain('encrypted/budget-2025-06-01.sqlite.age');
    expect(left).not.toContain('encrypted/budget-2025-05-01.sqlite.age');
  });
});

describe('BackupScheduler', () => {
  it('runs once per night with catch-up, reports failures to the Posteingang once', async () => {
    s3.objects.clear();
    const live = seededDatabase();
    const messages: string[] = [];
    const scheduler = new BackupScheduler({
      sqlite: live.sqlite,
      db: live.db,
      config: { ...config, ageBin: hasAge ? 'age' : 'false' },
      log: (m) => messages.push(m),
    });
    await scheduler.init();
    // Before 02:00 UTC on the first day: the last success is unknown, so it catches up now.
    expect(scheduler.due(new Date('2026-10-01T01:00:00Z'))).toBe(true);

    s3.setFailPuts(true);
    expect(await scheduler.tick(new Date('2026-10-01T02:05:00Z'))).toBeUndefined();
    expect(await scheduler.tick(new Date('2026-10-01T02:20:00Z'))).toBeUndefined(); // waits an hour
    await scheduler.tick(new Date('2026-10-01T03:10:00Z'));
    const open = () =>
      live.db
        .select()
        .from(schema.inboxItem)
        .all()
        .filter((i) => i.refType === 'encrypted_backup' && !i.resolvedAt);
    expect(open()).toHaveLength(1);
    expect(open()[0]?.title).toBe('Verschlüsselte Sicherung fehlgeschlagen');
    expect(messages.filter((m) => m.startsWith('Encrypted backup failed'))).toHaveLength(2);
    expect(messages.join('\n')).not.toContain('test-secret');

    if (hasAge) {
      s3.setFailPuts(false);
      expect(await scheduler.tick(new Date('2026-10-01T04:15:00Z'))).toBeDefined();
      expect(open()).toHaveLength(0);
      expect(scheduler.due(new Date('2026-10-01T23:00:00Z'))).toBe(false);
      expect(scheduler.due(new Date('2026-10-02T01:00:00Z'))).toBe(false);
      expect(scheduler.due(new Date('2026-10-02T02:00:00Z'))).toBe(true);
      // A restart learns the newest copy from the bucket and does not run again the same day.
      const restarted = new BackupScheduler({ sqlite: live.sqlite, db: live.db, config });
      await restarted.init();
      expect(restarted.due(new Date('2026-10-01T22:00:00Z'))).toBe(false);
    }
    live.close();
  });
});

describe('backupConfigFromEnv', () => {
  const bucket = {
    BUCKET_NAME: 'b',
    AWS_ENDPOINT_URL_S3: 'https://fly.storage.tigris.dev',
    AWS_ACCESS_KEY_ID: 'k',
    AWS_SECRET_ACCESS_KEY: 's',
  };

  it('is off without a recipient, but required in production with a bucket', () => {
    expect(backupConfigFromEnv({})).toBeUndefined();
    expect(backupConfigFromEnv({ NODE_ENV: 'production' })).toBeUndefined();
    expect(() => backupConfigFromEnv({ NODE_ENV: 'production', ...bucket })).toThrow(
      /BUDGET_BACKUP_RECIPIENT is required/,
    );
  });

  it('accepts one or more age public keys and rejects anything else (e.g. a private key)', () => {
    const a = `age1${'q'.repeat(58)}`;
    const b = `age1${'p'.repeat(58)}`;
    expect(
      backupConfigFromEnv({ ...bucket, BUDGET_BACKUP_RECIPIENT: `${a}, ${b}` })?.recipients,
    ).toEqual([a, b]);
    expect(() =>
      backupConfigFromEnv({
        ...bucket,
        BUDGET_BACKUP_RECIPIENT: `AGE-SECRET-KEY-1${'Q'.repeat(58)}`,
      }),
    ).toThrow(/age public keys/);
    expect(() => backupConfigFromEnv({ BUDGET_BACKUP_RECIPIENT: a })).toThrow(/BUCKET_NAME/);
  });
});
