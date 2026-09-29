/** Object key of the encrypted backup of one UTC day. */
export const backupKey = (prefix: string, day: string) => `${prefix}budget-${day}.sqlite.age`;

const KEY_DATE = /budget-(\d{4}-\d{2}-\d{2})\.sqlite\.age$/;

/** The UTC day (`YYYY-MM-DD`) of a backup key, undefined for anything else. */
export const backupDay = (key: string): string | undefined => KEY_DATE.exec(key)?.[1];

export interface RetentionPolicy {
  daily: number;
  monthly: number;
}

/**
 * Keys to delete so that the newest `daily` backups remain, plus the first backup of each of the
 * newest `monthly` months. Keys that are not backups of this job are never touched.
 */
export function backupsToDelete(
  keys: string[],
  policy: RetentionPolicy = { daily: 30, monthly: 12 },
): string[] {
  const backups = keys
    .map((key) => ({ key, day: backupDay(key) }))
    .filter((b): b is { key: string; day: string } => b.day !== undefined)
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  const keep = new Set(backups.slice(0, policy.daily).map((b) => b.key));
  const firstOfMonth = new Map<string, string>();
  // Oldest first, so the first key seen per month is that month's first backup.
  for (const b of [...backups].reverse())
    if (!firstOfMonth.has(b.day.slice(0, 7))) firstOfMonth.set(b.day.slice(0, 7), b.key);
  const months = [...firstOfMonth.keys()].sort().reverse().slice(0, policy.monthly);
  for (const month of months) keep.add(firstOfMonth.get(month) as string);
  return backups.filter((b) => !keep.has(b.key)).map((b) => b.key);
}
