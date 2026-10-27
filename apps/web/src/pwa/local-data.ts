import { clearChoices } from './queue-store';
import { clearSnapshots, revokeSnapshots } from './snapshots';

/** Key of the capture panel's recently used account and category ids (see ledger/capture-model). */
export const CAPTURE_MEMORY_KEY = 'budget-capture-memory';

/**
 * localStorage keys that hold data derived from the user's ledger (ids of accounts and categories).
 * Pure UI preferences (theme, hidden amounts, sidebar, folded sections, plan span, chart and
 * liquidity choices) are not financial data and stay on the device.
 */
export const FINANCIAL_LOCAL_STORAGE_KEYS: readonly string[] = [CAPTURE_MEMORY_KEY];

/** The service worker keeps only the app shell under this prefix; never API responses. */
export const SHELL_CACHE_PREFIX = 'budget-shell-';

/**
 * Removes locally stored financial data after sign-out: form choices and approved view snapshots
 * in IndexedDB, capture memory in localStorage and any service-worker cache that is not the app
 * shell (the offline shell stays, it holds no data). Unsent queued bookings
 * (IndexedDB store `bookings`) are deliberately untouched: queue behaviour is unchanged (#557).
 * Every step is best effort and independent; blocked storage never prevents the sign-out. Snapshot
 * reads require a positive permission removed before the physical clear starts.
 */
export async function clearDeviceFinancialData(): Promise<void> {
  revokeSnapshots();
  for (const key of FINANCIAL_LOCAL_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Blocked storage holds nothing to remove. */
    }
  }
  try {
    // A database held open elsewhere must not trap the user on the settings page.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const giveUp = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, 3000);
    });
    try {
      await Promise.race([Promise.all([clearChoices(), clearSnapshots()]), giveUp]);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    /* IndexedDB unavailable or blocked: no offline read permission remains after revocation. */
  }
  try {
    for (const name of await caches.keys())
      if (!name.startsWith(SHELL_CACHE_PREFIX)) await caches.delete(name);
  } catch {
    /* Cache Storage is unavailable (insecure context, private mode). */
  }
}
