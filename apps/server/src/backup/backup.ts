import { openDatabase, schema, writesHeld, type Db, type OpenedDatabase } from '@budget/db';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { backupDay, backupKey, backupsToDelete } from './retention';
import { S3Client, type S3Config } from './s3';
import { receiptDirectory, receiptPath, verifyReceiptFile } from '../receipts/files';

const run = promisify(execFile);
type Sqlite = OpenedDatabase['sqlite'];
const HOUR = 3_600_000;
// Windows may put Git's GNU tar first on PATH; its colon parsing treats drive letters as hosts.
export const tarBinary =
  process.platform === 'win32'
    ? join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';

export interface BackupConfig {
  /** age recipients (public keys, `age1…`). The server can encrypt but never decrypt. */
  recipients: string[];
  s3: S3Config;
  /** Key prefix in the bucket; Litestream owns `budget.sqlite/`. */
  prefix: string;
  /** `age` binary. */
  ageBin: string;
}

/** Bech32 age X25519 recipient. */
const RECIPIENT = /^age1[02-9ac-hj-np-z]{58}$/;

/**
 * Backup settings from the environment. Off (undefined) without `BUDGET_BACKUP_RECIPIENT`, except
 * in production with a bucket: there a missing recipient stops the start, because the encrypted
 * copy is the backup that survives a lost Fly account or bucket key (docs/ops.md section 8).
 */
export function backupConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): BackupConfig | undefined {
  const raw = env['BUDGET_BACKUP_RECIPIENT']?.trim();
  const bucket = env['BUCKET_NAME']?.trim();
  if (!raw) {
    if (env['NODE_ENV'] === 'production' && bucket)
      throw new Error(
        'BUDGET_BACKUP_RECIPIENT is required in production (age public key, see docs/ops.md section 8)',
      );
    return undefined;
  }
  const recipients = raw.split(/[\s,]+/).filter(Boolean);
  for (const r of recipients)
    if (!RECIPIENT.test(r))
      throw new Error('BUDGET_BACKUP_RECIPIENT must be one or more age public keys (age1…)');
  const endpoint = env['AWS_ENDPOINT_URL_S3']?.trim();
  const accessKeyId = env['AWS_ACCESS_KEY_ID']?.trim();
  const secretAccessKey = env['AWS_SECRET_ACCESS_KEY']?.trim();
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey)
    throw new Error(
      'Encrypted backup needs BUCKET_NAME, AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY',
    );
  return {
    recipients,
    s3: { endpoint, bucket, accessKeyId, secretAccessKey, region: 'auto' },
    prefix: 'encrypted/',
    ageBin: env['BUDGET_AGE_BIN'] ?? 'age',
  };
}

export interface BackupResult {
  key: string;
  bytes: number;
  deleted: string[];
}

/** A snapshot defines the exact immutable blob set, including soft-deleted rows needed by undo. */
export async function createBackupArchive(sqlite: Sqlite, dir: string, receiptsDir: string) {
  const staging = join(dir, 'snapshot');
  await mkdir(join(staging, 'receipts'), { recursive: true, mode: 0o700 });
  const snapshot = join(staging, 'budget.sqlite');
  sqlite.prepare('VACUUM INTO ?').run(snapshot);
  const copy = openDatabase(snapshot);
  let blobs: { sha256: string; sizeBytes: number }[];
  try {
    blobs = copy.db
      .selectDistinct({ sha256: schema.receipt.sha256, sizeBytes: schema.receipt.sizeBytes })
      .from(schema.receipt)
      .where(isNotNull(schema.receipt.sha256))
      .all() as { sha256: string; sizeBytes: number }[];
  } finally {
    copy.close();
  }
  for (const blob of blobs) {
    const source = await verifyReceiptFile(receiptsDir, blob.sha256, blob.sizeBytes);
    await copyFile(source, receiptPath(join(staging, 'receipts'), blob.sha256));
  }
  const archive = join(dir, 'budget.tar');
  await run(tarBinary, ['-cf', archive, '-C', staging, 'budget.sqlite', 'receipts']);
  await rm(staging, { recursive: true, force: true });
  return archive;
}

/**
 * One run: consistent snapshot with `VACUUM INTO` (a transaction-consistent copy while the app
 * keeps writing), encrypt it with age to the recipients, upload, apply the retention. The
 * plaintext snapshot only exists in a private temp folder for the duration of the run.
 */
export async function runBackup(
  sqlite: Sqlite,
  config: BackupConfig,
  now: Date,
  client = new S3Client(config.s3),
  receiptsDir = receiptDirectory(sqlite.name),
): Promise<BackupResult> {
  const dir = await mkdtemp(join(tmpdir(), 'budget-backup-'));
  try {
    const plain = await createBackupArchive(sqlite, dir, receiptsDir);
    const sealed = `${plain}.age`;
    await run(config.ageBin, [
      '--encrypt',
      ...config.recipients.flatMap((r) => ['-r', r]),
      '-o',
      sealed,
      plain,
    ]);
    await rm(plain);
    const bytes = (await stat(sealed)).size;
    const key = backupKey(config.prefix, now.toISOString().slice(0, 10));
    await client.putFile(key, sealed);
    const deleted = backupsToDelete(await client.list(config.prefix));
    for (const old of deleted) await client.delete(old);
    return { key, bytes, deleted };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const INBOX_REF = 'encrypted_backup';

/**
 * Nightly schedule with catch-up: every check (15 min) runs the backup when today's (UTC) copy
 * is missing and it is past 02:00 UTC, or when the last success is more than 26 hours old (a
 * machine that was down at night catches up). A failure is logged and put into the Posteingang
 * once; the next check retries. The app itself never waits for or fails with the backup.
 */
export class BackupScheduler {
  private lastDay: string | undefined;
  private lastSuccess = 0;
  private running = false;
  private lastRetry = 0;

  constructor(
    private readonly deps: {
      sqlite: Sqlite;
      db: Db;
      config: BackupConfig;
      client?: S3Client;
      log?: (message: string) => void;
    },
  ) {}

  private get client() {
    return this.deps.client ?? new S3Client(this.deps.config.s3);
  }

  private log(message: string) {
    (this.deps.log ?? console.log)(message);
  }

  /** Learn the newest existing backup from the bucket (so a restart does not re-run the night). */
  async init(): Promise<void> {
    const days = (await this.client.list(this.deps.config.prefix))
      .map(backupDay)
      .filter((d): d is string => d !== undefined)
      .sort();
    this.lastDay = days.at(-1);
    if (this.lastDay) this.lastSuccess = Date.parse(`${this.lastDay}T02:00:00Z`);
  }

  due(now: Date): boolean {
    const today = now.toISOString().slice(0, 10);
    if (this.lastDay === today) return false;
    return now.getUTCHours() >= 2 || now.getTime() - this.lastSuccess > 26 * HOUR;
  }

  /** Run if due. Resolves after the run; never throws. */
  async tick(now = new Date()): Promise<BackupResult | undefined> {
    // While an import task writes, wait for the next check (the copy would miss the task anyway).
    if (this.running || !this.due(now) || writesHeld(this.deps.db)) return undefined;
    // After a failure wait an hour before the next attempt.
    if (now.getTime() - this.lastRetry < HOUR) return undefined;
    this.running = true;
    try {
      const result = await runBackup(this.deps.sqlite, this.deps.config, now, this.client);
      this.lastDay = now.toISOString().slice(0, 10);
      this.lastSuccess = now.getTime();
      this.lastRetry = 0;
      this.resolveInbox(now);
      this.log(
        `Encrypted backup uploaded: ${result.key} (${result.bytes} bytes), ${result.deleted.length} old copies deleted`,
      );
      return result;
    } catch (error) {
      this.lastRetry = now.getTime();
      const message = error instanceof Error ? error.message : String(error);
      this.log(`Encrypted backup failed: ${message}`);
      this.reportInbox(message, now);
      return undefined;
    } finally {
      this.running = false;
    }
  }

  private openItem() {
    const { inboxItem } = schema;
    return this.deps.db
      .select()
      .from(inboxItem)
      .where(and(eq(inboxItem.refType, INBOX_REF), isNull(inboxItem.resolvedAt)))
      .get();
  }

  private reportInbox(message: string, now: Date) {
    if (writesHeld(this.deps.db) || this.openItem()) return;
    this.deps.db
      .insert(schema.inboxItem)
      .values({
        id: randomUUID(),
        kind: 'other',
        title: 'Verschlüsselte Sicherung fehlgeschlagen',
        detail: message.slice(0, 300),
        refType: INBOX_REF,
        urgent: true,
        createdAt: now.toISOString(),
      })
      .run();
  }

  private resolveInbox(now: Date) {
    if (writesHeld(this.deps.db)) return;
    this.deps.db
      .update(schema.inboxItem)
      .set({ resolvedAt: now.toISOString(), resolution: 'Sicherung wieder erfolgreich' })
      .where(and(eq(schema.inboxItem.refType, INBOX_REF), isNull(schema.inboxItem.resolvedAt)))
      .run();
  }
}
