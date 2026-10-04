import { useEffect, useState } from 'react';

const KEY = 'budget-storage-persistence-requested';
export type StorageProtection =
  'checking' | 'protected' | 'best-effort' | 'unsupported' | 'unavailable';
let attempted = false;
let pending: Promise<StorageProtection> | undefined;

/** One request per device/origin, after authentication; denial is a status, never a retry loop. */
export function protectStorage(): Promise<StorageProtection> {
  if (pending) return pending;
  pending = (async () => {
    const storage = navigator.storage;
    if (!storage?.persist || !storage.persisted) return 'unsupported';
    try {
      if (await storage.persisted()) return 'protected';
      let recorded = attempted;
      try {
        recorded ||= localStorage.getItem(KEY) === '1';
      } catch {
        /* In-memory guard remains. */
      }
      if (recorded) return 'best-effort';
      attempted = true;
      try {
        localStorage.setItem(KEY, '1');
      } catch {
        /* Never retry in this session. */
      }
      return (await storage.persist()) ? 'protected' : 'best-effort';
    } catch {
      return 'unavailable';
    }
  })();
  return pending;
}

export function useStorageProtection() {
  const [status, setStatus] = useState<StorageProtection>('checking');
  useEffect(() => {
    void protectStorage().then(setStatus);
  }, []);
  return status;
}
