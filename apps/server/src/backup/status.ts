import type { Db } from '@budget/db';

/** Operational observations only. An archive date is not a completed restore or freshness proof. */
export interface BackupStatus {
  configured: boolean | null;
  running: boolean;
  latestKnownArchiveDay: string | null;
  inventoryCheckedAt: string | null;
  lastCompletedAt: string | null;
  lastFailureAt: string | null;
  lastAttemptFailed: boolean;
}
const readers = new WeakMap<Db, () => BackupStatus>();
export function registerBackupStatus(db: Db, read: () => BackupStatus): void {
  readers.set(db, read);
}
export function readBackupStatus(db: Db): BackupStatus {
  return readers.get(db)?.() ?? {
    configured: null, running: false, latestKnownArchiveDay: null,
    inventoryCheckedAt: null, lastCompletedAt: null, lastFailureAt: null, lastAttemptFailed: false,
  };
}
