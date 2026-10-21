import type { Db } from '@budget/db';

// Single-owner app: the database identifies the owner across sessions/devices.
// Limits are process-local; production runs one API process per database.
const owners = new Set<Db>();
const GLOBAL_LIMIT = 2;

export function admitExport(db: Db): (() => void) | undefined {
  if (owners.has(db) || owners.size >= GLOBAL_LIMIT) return undefined;
  owners.add(db);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    owners.delete(db);
  };
}
