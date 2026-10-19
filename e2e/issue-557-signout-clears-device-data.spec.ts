import { expect, test, type Page } from '@playwright/test';
import { MAIN_URL } from '../playwright.config';

// Sign-out must leave no financial data on the device (#557). The server-side logout is answered
// by a stub here: the real one would revoke the session cookie every other spec shares, and the
// real logout ceremony is covered by e2e/auth.spec.ts. Everything on the client runs for real.
test.use({ serviceWorkers: 'allow' });
test.setTimeout(90_000);

/** Every localStorage key that may remain after sign-out: UI preferences only, no ledger data. */
const PREFERENCE_KEYS = [
  'budget-theme',
  'budget-amounts-hidden',
  'budget-sidebar-collapsed',
  'budget-sidebar-width',
  'budget-storage-persistence-requested',
  'budget-liquidity-selection',
  'budget-balance-month',
  'budget.plan.months',
  'budget.account.chart-open',
];
/** Preference families whose key carries a page, group or viewport suffix. */
const PREFERENCE_PREFIXES = [
  'budget-acct-tree-',
  'budget-heute-more-',
  'budget.register.upcoming.',
  'budget.report-sections.',
];

type Snapshot = {
  keys: string[];
  stores: string[];
  queued: number;
  memory: string | null;
  theme: string | null;
  choices: number;
  caches: string[];
};

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(async () => {
    const database = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('budget-capture', 1);
        open.onupgradeneeded = () => {
          open.result.createObjectStore('bookings', { keyPath: 'id' });
          open.result.createObjectStore('choices');
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => resolve(open.result);
      });
    const db = await database();
    const stores = [...db.objectStoreNames].sort();
    db.close();
    const count = (store: string) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('budget-capture', 1);
        open.onupgradeneeded = () => {
          open.result.createObjectStore('bookings', { keyPath: 'id' });
          open.result.createObjectStore('choices');
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction(store, 'readonly').objectStore(store).count();
          request.onsuccess = () => {
            db.close();
            resolve(request.result);
          };
          request.onerror = () => reject(request.error);
        };
      });
    return {
      keys: Object.keys(localStorage).sort(),
      stores,
      queued: await count('bookings'),
      memory: localStorage.getItem('budget-capture-memory'),
      theme: localStorage.getItem('budget-theme'),
      choices: await count('choices'),
      caches: (await caches.keys()).sort(),
    };
  });
}

test('sign-out deletes cached choices, capture memory and data caches; shell and preferences stay', async ({
  page,
}, info) => {
  // page.route() is not reliable with an active service worker (WebKit let the real logout through
  // and revoked the session shared by all specs), so the logout answer is faked inside the page.
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      return url.endsWith('/api/auth/logout')
        ? Promise.resolve(
            new Response('{"ok":true}', {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          )
        : original(input, init);
    };
  });
  const created = await page.request.post('/api/accounts', {
    headers: { origin: MAIN_URL },
    data: {
      name: `Signout ${info.project.name} ${info.testId.slice(-10)}`,
      type: 'cash',
      openingDate: '2026-10-01',
      openingBalanceCents: 10000,
    },
  });
  expect(created.status()).toBe(201);
  const { account } = await created.json();

  // The capture panel stores the form choices (account, category and contact names) on the device.
  await page.goto(`/konten/${account.id}?panel=buchung`);
  await expect(
    page
      .getByRole('dialog', { name: 'Buchung erfassen', exact: true })
      .getByLabel('Bezahlt von', { exact: true }),
  ).toHaveValue(account.id);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => snapshot(page).then((s) => s.choices)).toBe(1);

  // Seed what a signed-in device may hold besides: capture memory, a data cache, a preference.
  await page.evaluate(async () => {
    localStorage.setItem('budget-capture-memory', '{"accounts":["a1"],"categories":["c1"]}');
    localStorage.setItem('budget-theme', 'dark');
    await (await caches.open('api-responses-seed')).put('/seed', new Response('{"balance":1}'));
  });
  const before = await snapshot(page);
  expect(before.memory).not.toBeNull();
  expect(before.choices).toBe(1);
  expect(before.caches.some((name) => name.startsWith('budget-shell-'))).toBe(true);
  expect(before.caches).toContain('api-responses-seed');

  await page.goto('/einstellungen/sicherheit');
  await page.getByRole('button', { name: 'Abmelden' }).click();

  await expect
    .poll(async () => {
      const after = await snapshot(page);
      return {
        memory: after.memory,
        choices: after.choices,
        dataCaches: after.caches.filter((name) => !name.startsWith('budget-shell-')),
      };
    })
    .toEqual({ memory: null, choices: 0, dataCaches: [] });

  const after = await snapshot(page);
  // The offline shell and non-financial preferences survive.
  expect(after.caches.some((name) => name.startsWith('budget-shell-'))).toBe(true);
  expect(after.theme).toBe('dark');
  // Only preference keys remain in localStorage (explicit allow-list, no ledger data).
  expect(
    after.keys.filter(
      (key) =>
        !PREFERENCE_KEYS.includes(key) &&
        !PREFERENCE_PREFIXES.some((prefix) => key.startsWith(prefix)),
    ),
  ).toEqual([]);
  // The offline queue's store is intact and its content unchanged by sign-out.
  expect(after.stores).toEqual(['bookings', 'choices']);
  expect(after.queued).toBe(before.queued);

  // The next session fetches fresh data and refills the choices from the server.
  await page.goto(`/konten/${account.id}?panel=buchung`);
  await expect.poll(() => snapshot(page).then((s) => s.choices)).toBe(1);
});
