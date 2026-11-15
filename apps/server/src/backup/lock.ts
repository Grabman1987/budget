import { open, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * One heavy maintenance job at a time on the small volume: the nightly encrypted backup and the
 * monthly restore test must not overlap (disk, memory, Litestream). The lock is a file next to the
 * database, so it also holds between the server process and the operator command (a separate
 * process). It records the owner's pid and start time; a lock whose process is gone, or which is
 * older than any job can run, is stale and taken over.
 */
const LOCK_FILE = '.maintenance.lock';
const STALE_AFTER_MS = 3 * 3_600_000;

export type Release = () => Promise<void>;

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/** Lock path for a database file; undefined for `:memory:` and unnamed databases (no lock). */
export const lockPathFor = (databasePath: string): string | undefined =>
  !databasePath || databasePath === ':memory:' ? undefined : join(dirname(databasePath), LOCK_FILE);

/**
 * Take the lock, or return undefined when a live job holds it. Without a path there is nothing to
 * coordinate with and the job just runs.
 */
export async function acquireMaintenanceLock(
  path: string | undefined,
  now: () => number = Date.now,
): Promise<Release | undefined> {
  if (!path) return async () => undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const file = await open(path, 'wx', 0o600);
      try {
        await file.writeFile(`${process.pid} ${now()}`);
      } finally {
        await file.close();
      }
      return async () => {
        await rm(path, { force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const [pid, since] = (await readFile(path, 'utf8').catch(() => '')).split(' ').map(Number);
    const stale =
      !Number.isInteger(pid) ||
      !Number.isFinite(since) ||
      !alive(pid as number) ||
      now() - (since as number) > STALE_AFTER_MS;
    if (!stale) return undefined;
    await rm(path, { force: true });
  }
  return undefined;
}
