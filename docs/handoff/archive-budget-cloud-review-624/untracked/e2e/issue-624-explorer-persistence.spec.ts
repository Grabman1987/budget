import { expect, devices } from '@playwright/test';
import type { ExplorerViewsState, ExplorerViewsWrite } from '@budget/domain';
import { test } from './isolated-ledger';

const endpoint = '/api/reports/saved-queries';
const localKey = 'budget-explorer-views';
const query = { dim: 'kategorie', cls: 'want', cols: 'quartal', period: '3J', meas: 'summe' };

test('saved Explorer views survive independent contexts, editing, deletion and grouped undo', async ({
  page,
  browser,
  isolatedLedger,
  playwright,
}) => {
  const second = await browser.newContext({
    ...devices['iPhone 13'],
    baseURL: isolatedLedger.origin,
    storageState: isolatedLedger.storageState,
    serviceWorkers: 'block',
  });
  const other = await second.newPage();
  const anonymous = await playwright.request.newContext({
    baseURL: isolatedLedger.origin,
    storageState: { cookies: [], origins: [] },
  });
  try {
    expect((await anonymous.get(endpoint)).status()).toBe(401);
    const original = (await (await page.request.get(endpoint)).json()) as ExplorerViewsState;
    expect(
      (
        await page.request.post(endpoint, {
          headers: { Origin: 'https://example.invalid' },
          data: { kind: 'save', revision: original.revision, view: { name: 'Verboten', query } },
        })
      ).status(),
    ).toBe(403);
    await page.goto('/reports/explorer');
    await expect(page.getByRole('button', { name: 'Speichern', exact: true })).toBeEnabled();
    await page.getByLabel('Spalten').selectOption('jahr');
    await page.getByLabel('Kennzahl').selectOption('avg');
    await page.getByLabel('Ansicht speichern').fill('Muster');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Muster', exact: true })).toBeVisible();
    const first = (await (await page.request.get(endpoint)).json()) as ExplorerViewsState;
    const id = first.views[0]!.id;
    await other.goto('/reports/explorer');
    await other.getByRole('button', { name: 'Muster', exact: true }).click();
    await expect(other.getByLabel('Kennzahl')).toHaveValue('avg');
    await expect(other.getByLabel('Spalten')).toHaveValue('jahr');
    await other.getByRole('button', { name: 'Ansicht Muster bearbeiten', exact: true }).click();
    await other.getByLabel('Ansicht speichern').fill('Umbenannt');
    await other.getByLabel('Kennzahl').selectOption('anzahl');
    await other.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(other.getByRole('button', { name: 'Umbenannt', exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Umbenannt', exact: true }).click();
    await expect(page.getByLabel('Kennzahl')).toHaveValue('anzahl');
    const edited = (await (await page.request.get(endpoint)).json()) as ExplorerViewsState;
    expect(edited.views[0]!.id).toBe(id);
    expect(
      (
        await page.request.post(endpoint, {
          headers: { Origin: isolatedLedger.origin },
          data: { kind: 'delete', id, revision: first.revision },
        })
      ).status(),
    ).toBe(409);
    await other.getByRole('button', { name: 'Ansicht Umbenannt löschen', exact: true }).click();
    await expect(other.getByRole('button', { name: 'Umbenannt', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Umbenannt', exact: true })).toHaveCount(0);
    await other.getByRole('button', { name: 'Rückgängig', exact: true }).click();
    await expect(other.getByRole('button', { name: 'Umbenannt', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Umbenannt', exact: true })).toBeVisible();
    await other.getByRole('button', { name: 'Wiederholen', exact: true }).click();
    await expect(other.getByRole('button', { name: 'Umbenannt', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Umbenannt', exact: true })).toHaveCount(0);
  } finally {
    await second.close();
    await anonymous.dispose();
  }
});

test('legacy promotion recovers a lost acknowledgment without overwriting or dropping unavailable local data', async ({
  page,
  browser,
  isolatedLedger,
}) => {
  const initial = (await (await page.request.get(endpoint)).json()) as ExplorerViewsState;
  const server = await page.request.post(endpoint, {
    headers: { Origin: isolatedLedger.origin },
    data: { kind: 'save', revision: initial.revision, view: { name: 'Muster', query } },
  });
  expect(server.ok()).toBe(true);
  const saved = (await server.json()) as ExplorerViewsWrite;
  const legacyQuery = { ...query, cols: 'jahr', meas: 'avg' };
  const invalid = { name: 'Unbekannt', query: { ...query, dim: 'future-dimension' } };
  const raw = JSON.stringify([{ name: 'Muster', query: legacyQuery }, invalid]);
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
    key: localKey,
    raw,
  });
  let imports = 0;
  await page.route(`**${endpoint}`, async (route) => {
    if (route.request().method() !== 'POST' || route.request().postDataJSON().kind !== 'import') {
      await route.continue();
      return;
    }
    imports++;
    if (imports === 1) {
      const committed = await route.fetch();
      expect(committed.ok()).toBe(true);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.goto('/reports/explorer');
  await expect(page.getByText(/Lokale Ansichten bleiben erhalten/)).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), localKey)).toBe(raw);
  await page.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Muster (lokal 1)', exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), localKey))
    .toBe(JSON.stringify([invalid]));
  await expect(page.getByText(/1 lokale Ansichten sind nicht verfügbar/)).toBeVisible();
  expect(imports).toBe(2);
  const persisted = (await (await page.request.get(endpoint)).json()) as ExplorerViewsState;
  expect(persisted.views).toHaveLength(2);
  expect(persisted.views.find((view) => view.id === saved.views[0]!.id)?.query).toEqual(query);
  expect(persisted.views.find((view) => view.name === 'Muster (lokal 1)')?.query).toEqual(
    legacyQuery,
  );
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    baseURL: isolatedLedger.origin,
    storageState: isolatedLedger.storageState,
    serviceWorkers: 'block',
  });
  try {
    const independent = await context.newPage();
    await independent.goto('/reports/explorer');
    await expect(independent.getByRole('button', { name: 'Muster', exact: true })).toBeVisible();
    await independent.getByRole('button', { name: 'Muster (lokal 1)', exact: true }).click();
    await expect(independent.getByLabel('Kennzahl')).toHaveValue('avg');
    await expect(independent.getByLabel('Spalten')).toHaveValue('jahr');
    expect(await independent.evaluate((key) => localStorage.getItem(key), localKey)).toBe(null);
  } finally {
    await context.close();
  }
});
