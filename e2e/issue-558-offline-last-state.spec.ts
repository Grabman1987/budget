import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { sampleTest as test, expect } from './sample';

test.use({ serviceWorkers: 'allow' });
test.setTimeout(90_000);

const viewCount = (page: Page) => page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('budget-offline-views', 1);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  try {
    return await new Promise<number>((resolve, reject) => {
      const request = db.transaction('views', 'readonly').objectStore('views').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
});

test('four exact successful reads survive offline reload, stay read-only and wipe on sign-out', async ({ page, context }, info) => {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname === '/api/auth/logout')
        return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
      const response = await original(input, init);
      if (!response.ok || (init?.method && init.method !== 'GET')) return response;
      const body = await response.clone().json();
      if (url.pathname === '/api/heute') body.lead.freeCents = 12345;
      else if (url.pathname === '/api/accounts' && !url.search) body.accounts[0].balanceCents = 98765;
      else if (url.pathname === '/api/budget/2026-09') body.summary.toBeAssignedCents = 4321;
      else if (url.pathname === '/api/bookings' && !url.searchParams.has('accountId') && body.items.length)
        body.items[0] = { ...body.items[0], amountCents: -6789, payeeName: 'Offline Stub' };
      else return response;
      return new Response(JSON.stringify(body), { status: response.status, headers: { 'content-type': 'application/json' } });
    };
  });
  for (const path of ['/', '/konten', '/plan/monat', '/konten/buchungen']) await page.goto(path);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const stored = () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('budget-offline-views', 1);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      return await new Promise<Record<string, { key: string; data: unknown }>>((resolve, reject) => {
        const tx = db.transaction('views', 'readonly');
        const get = tx.objectStore('views').getAll();
        get.onsuccess = () => resolve(Object.fromEntries(get.result.map((row) => [row.kind, row])));
        get.onerror = () => reject(get.error);
      });
    } finally { db.close(); }
  });
  await expect.poll(async () => Object.keys(await stored()).sort()).toEqual(['accounts', 'bookings', 'heute', 'plan']);
  const before = await stored();
  expect((before.heute!.data as { lead: { freeCents: number } }).lead.freeCents).toBe(12345);
  expect((before.accounts!.data as { accounts: { balanceCents: number }[] }).accounts[0]!.balanceCents).toBe(98765);
  expect((before.plan!.data as { summary: { toBeAssignedCents: number } }).summary.toBeAssignedCents).toBe(4321);
  expect((before.bookings!.data as { items: { amountCents: number }[] }).items[0]!.amountCents).toBe(-6789);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Budget ist offline' })).toBeVisible();
  await expect(page.getByText('Offline Stub')).toBeVisible();
  await page.getByRole('button', { name: 'Heute', exact: true }).click();
  await expect(page.getByText('123,45 €')).toBeVisible();
  await page.getByRole('button', { name: 'Kontensalden' }).click();
  await expect(page.getByText('987,65 €')).toBeVisible();
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByText('43,21 €')).toBeVisible();
  await expect(page.getByText(/Stand vom .+/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Konto anlegen' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Buchung erfassen' })).toBeVisible();
  for (const scheme of ['light', 'dark']) {
    await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), scheme);
    for (const [name, label] of [
      ['heute', 'Heute'], ['accounts', 'Kontensalden'], ['plan', 'Plan'], ['bookings', 'Letzte Buchungen'],
    ] as const) {
      await page.getByRole('button', { name: label, exact: true }).click();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const button of await page.locator('.offline-nav button').all())
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `test-results/offline-558-${info.project.name}-${name}-${scheme}.png`, fullPage: true });
    }
  }

  await context.setOffline(false);
  await page.goto('/einstellungen/sicherheit');
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect.poll(async () => Object.keys(await stored())).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('budget-offline-wipe-pending'))).toBeNull();
});

test('a successful read held across another tab’s sign-out cannot repopulate the cleared store', async ({ page, context }) => {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const response = await original(input, init);
      if (url.pathname === '/api/heute' && response.ok) {
        await new Promise<void>((resolve) => {
          (window as Window & { releaseHeldRead?: () => void; heldRead?: boolean }).releaseHeldRead = resolve;
          (window as Window & { heldRead?: boolean }).heldRead = true;
        });
      }
      return response;
    };
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => (window as Window & { heldRead?: boolean }).heldRead)).toBe(true);
  const other = await context.newPage();
  await other.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      return url.pathname === '/api/auth/logout'
        ? Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }))
        : original(input, init);
    };
  });
  await other.goto('/einstellungen/sicherheit');
  await other.getByRole('button', { name: 'Abmelden' }).click();
  await expect.poll(() => other.evaluate(() => localStorage.getItem('budget-offline-wipe-pending'))).toBeNull();
  await page.evaluate(() => (window as Window & { releaseHeldRead?: () => void }).releaseHeldRead?.());
  await expect.poll(() => viewCount(other)).toBe(0);
  await other.close();
});

test('failed server logout still physically wipes snapshots and keeps its error visible', async ({ page, context }) => {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      return url.pathname === '/api/auth/logout'
        ? Promise.resolve(new Response('{"error":"synthetic_failure"}', { status: 500, headers: { 'content-type': 'application/json' } }))
        : original(input, init);
    };
  });
  await page.goto('/');
  await expect.poll(() => viewCount(page)).toBeGreaterThan(0);
  await page.goto('/einstellungen/sicherheit');
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect.poll(() => viewCount(page)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('budget-offline-wipe-pending'))).toBeNull();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Für diese Seite brauchst du eine Verbindung.')).toBeVisible();
  expect(await viewCount(page)).toBe(0);
});

test('a native database open released after logout cannot restore an old read', async ({ page, context }) => {
  await page.addInitScript(() => {
    type RaceWindow = Window & { holdNextOpen?: boolean; heldOpen?: boolean; releaseHeldOpen?: () => void };
    const state = window as RaceWindow;
    const nativeOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((name: string, version?: number) => {
      const request = nativeOpen(name, version);
      if (name === 'budget-offline-views' && state.holdNextOpen) {
        state.holdNextOpen = false;
        let handler: ((event: Event) => void) | null = null;
        Object.defineProperty(request, 'onsuccess', {
          configurable: true,
          get: () => handler,
          set: (next: (event: Event) => void) => { handler = next; },
        });
        request.addEventListener('success', (event) => {
          state.heldOpen = true;
          state.releaseHeldOpen = () => handler?.(event);
        }, { once: true });
      }
      return request;
    }) as typeof indexedDB.open;
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const response = await original(input, init);
      if (url.pathname === '/api/heute' && response.ok) state.holdNextOpen = true;
      return response;
    };
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => (window as Window & { heldOpen?: boolean }).heldOpen)).toBe(true);
  const other = await context.newPage();
  await other.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      return url.pathname === '/api/auth/logout'
        ? Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }))
        : original(input, init);
    };
  });
  await other.goto('/einstellungen/sicherheit');
  await other.getByRole('button', { name: 'Abmelden' }).click();
  await expect.poll(() => other.evaluate(() => localStorage.getItem('budget-offline-wipe-pending'))).toBeNull();
  await page.evaluate(() => (window as Window & { releaseHeldOpen?: () => void }).releaseHeldOpen?.());
  await expect.poll(() => viewCount(other)).toBe(0);
  await other.close();
});
