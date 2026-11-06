import type { Db } from '@budget/db';
import { createReadStream } from 'node:fs';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono, type MiddlewareHandler } from 'hono';
import { backupConfigFromEnv } from '../backup/backup';
import { S3Client } from '../backup/s3';
import { admitExport } from './export-admission';

/** Read an existing completed night copy; never create a snapshot or expose storage credentials. */
export function encryptedBackupRoutes(db: Db, stepUp: MiddlewareHandler): Hono {
  const api = new Hono();
  api.get('/backup.age', stepUp, async (c) => {
    // Hono routes HEAD through GET and discards its body without consuming the stream.
    if (c.req.method === 'HEAD') return c.body(null, 405, { Allow: 'GET' });
    const release = admitExport(db);
    if (!release) return c.json({ error: 'export_busy' }, 429);
    let dir: string | undefined;
    let cleanup: Promise<void> | undefined;
    const finish = () =>
      (cleanup ??= (async () => {
        try {
          if (dir) await rm(dir, { recursive: true, force: true });
        } finally {
          release();
        }
      })());
    try {
      const config = backupConfigFromEnv();
      if (!config) {
        await finish();
        return c.json({ error: 'backup_unavailable' }, 503);
      }
      const client = new S3Client(config.s3);
      const keys = (await client.list(config.prefix))
        .filter(
          (key) =>
            key.startsWith(config.prefix) &&
            /^budget-\d{4}-\d{2}-\d{2}\.tar\.age$/.test(key.slice(config.prefix.length)),
        )
        .sort();
      const key = keys.at(-1);
      if (!key) {
        await finish();
        return c.json({ error: 'backup_missing' }, 404);
      }
      dir = await mkdtemp(join(tmpdir(), 'budget-backup-download-'));
      await chmod(dir, 0o700);
      const path = join(dir, 'backup.age');
      const size = await client.getEncryptedFile(key, path, c.req.raw.signal);
      c.req.raw.signal.throwIfAborted();
      const source = createReadStream(path);
      const iterator = source[Symbol.asyncIterator]();
      const close = async () => {
        const closed = source.closed
          ? Promise.resolve()
          : new Promise<void>((resolve) => source.once('close', resolve));
        source.destroy();
        await closed;
        c.req.raw.signal.removeEventListener('abort', abort);
        await finish();
      };
      const abort = () => {
        source.destroy(new Error('Backup download cancelled'));
      };
      c.req.raw.signal.addEventListener('abort', abort, { once: true });
      source.once('error', () => {
        void close();
      });
      source.once('end', () => {
        void close();
      });
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const part = await iterator.next();
            if (part.done) {
              await close();
              controller.close();
            } else controller.enqueue(part.value);
          } catch {
            await close();
            controller.error(new Error('Backup download interrupted'));
          }
        },
        async cancel() {
          await close();
        },
      });
      c.header('Content-Type', 'application/octet-stream');
      c.header('Content-Disposition', `attachment; filename="${key.slice(config.prefix.length)}"`);
      c.header('Content-Length', String(size));
      c.header('Cache-Control', 'no-store');
      c.header('X-Content-Type-Options', 'nosniff');
      return c.body(stream);
    } catch {
      await finish();
      return c.json({ error: 'backup_unavailable' }, 503);
    }
  });
  return api;
}
