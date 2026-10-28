import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('named filter save lives in the existing actions menu and persists the exact tuple', async ({ page, isolatedLedger }, info) => {
  const origin = isolatedLedger.origin;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`${origin}/api${path}`, { headers: { origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const { account } = await post('/accounts', { name: 'Synthetic filter account', type: 'checking', openingDate: '2026-09-01' });
  const ids: string[] = [];
  for (const amountCents of [-1234, 567, -890]) ids.push((await post('/bookings', {
    type: 'booking', accountId: account.id, date: '2026-10-02', amountCents,
    memo: 'Synthetic filter', status: 'pending', flag: 'blue',
  })).id);
  await post('/bookings', { type: 'booking', accountId: account.id, date: '2026-10-02', amountCents: -9999, memo: 'Outside filter' });
  const writes: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET' && path.startsWith('/api/bookings') && path !== '/api/bookings/saved-views')
      writes.push(`${request.method()} ${path}`);
  });
  const search = {
    konto: account.id, status: 'pending', markierung: 'blue', von: '2026-10-01',
    bis: '2026-10-02', q: 'Synthetic filter', sortierung: 'amount', richtung: 'asc',
  };
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto(`/konten/buchungen?${new URLSearchParams(search)}`);
    await expect(page.locator('.ksum')).toContainText('3 Buchungen');
    await expect(page.locator('.ksum')).toContainText('−15,57 €');
    await expect.poll(async () => new Set(await page.locator('tr[data-booking]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-booking'))))).toEqual(new Set(ids));
    await page.evaluate(() => document.fonts.ready);
    const bar = (await page.locator('.kbookings-bar').boundingBox())!;
    await page.locator('.kregister-actions summary').click();
    const save = page.getByRole('button', { name: 'Ansicht speichern', exact: true });
    await expect(save).toBeVisible();
    await save.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Filteransicht speichern', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Name', { exact: true }).fill(`Synthetic ${theme}`);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (info.project.name !== 'desktop') for (const control of await dialog.locator('input:visible, button:visible').all()) {
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(dialog).toBeHidden();
    const read = await page.request.get(`${origin}/api/bookings/saved-views`);
    expect(read.status()).toBe(200);
    const state = await read.json() as { views: Array<{ name: string; search: Record<string, string> }> };
    expect(state.views.find((view) => view.name === `Synthetic ${theme}`)?.search).toEqual(search);
    await page.reload();
    await expect(page.locator('.ksum')).toContainText('−15,57 €');
    await page.evaluate(() => document.fonts.ready);
    expect((await page.locator('.kbookings-bar').boundingBox())!.height).toBe(bar.height);
    await page.goto('/konten/buchungen?q=Outside%20filter&kategorie=none&sortierung=date');
    await expect(page.locator('.ksum')).toContainText('1 Buchung');
    await page.locator('.kregister-actions summary').click();
    await page.getByRole('button', { name: 'Gespeicherte Ansichten', exact: true }).click();
    const manager = page.getByRole('dialog', { name: 'Gespeicherte Filteransichten', exact: true });
    await manager.getByRole('button', { name: `Synthetic ${theme}`, exact: true }).click();
    await expect(manager).toBeHidden();
    await expect(page).toHaveURL((url) => url.searchParams.size === Object.keys(search).length && Object.entries(search).every(([key, value]) => url.searchParams.get(key) === value));
    await expect.poll(async () => new Set(await page.locator('tr[data-booking]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-booking'))))).toEqual(new Set(ids));
    await expect(page.locator('.ksum')).toContainText('3 Buchungen');
    await expect(page.locator('.ksum')).toContainText('−15,57 €');
    const actions = page.locator('.kregister-actions');
    if (await actions.getAttribute('open') === null) await actions.locator('summary').click();
    const csv = await page.request.get((await page.getByRole('link', { name: 'Aktuellen Filter als CSV exportieren' }).getAttribute('href'))!);
    expect(csv.status()).toBe(200);
    const lines = (await csv.text()).replace(/^\uFEFF/, '').trimEnd().split('\r\n');
    expect(lines).toHaveLength(4);
    expect(new Set(lines.slice(1).map((line) => line.split(';')[0]!.replaceAll('"', '')))).toEqual(new Set(ids));
  }
  expect(writes).toEqual([]);
});

for (const failure of ['conflict', 'lost response'] as const) test(`pending and ${failure} saves retain the draft while ordinary URL filters remain independent`, async ({ page, isolatedLedger }) => {
  const origin = isolatedLedger.origin;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let fail = true;
  await page.route('**/api/bookings/saved-views', async (route) => {
    if (route.request().method() === 'POST' && fail) {
      await gate;
      if (failure === 'conflict') await route.fulfill({ status: 409, json: { error: 'conflict', message: 'Synthetic concurrent edit' } });
      else { await route.fetch(); await route.abort('failed'); }
    } else await route.continue();
  });
  try {
    await page.goto('/konten/buchungen?q=Synthetic%20draft');
    await page.locator('.kregister-actions summary').click();
    await page.getByRole('button', { name: 'Ansicht speichern', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Filteransicht speichern', exact: true });
    await dialog.getByLabel('Name', { exact: true }).fill('Draft survives');
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    release();
    await expect(dialog.getByRole('alert')).toContainText('Entwurf bleibt erhalten');
    await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Draft survives');
    const state = await page.request.get(`${origin}/api/bookings/saved-views`);
    const views = (await state.json()).views as Array<{ name: string }>;
    expect(views.map((view) => view.name)).toEqual(failure === 'conflict' ? [] : ['Draft survives']);
    fail = false;
    if (failure === 'lost response') await dialog.getByLabel('Name', { exact: true }).fill('Explicit retry');
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(dialog).toBeHidden();
    const actions = page.locator('.kregister-actions');
    if (await actions.getAttribute('open') !== null) await actions.locator('summary').click();
    const input = page.getByLabel('In Buchungen suchen');
    await input.fill('Still independent');
    await expect(page).toHaveURL(/q=Still%20independent/);
  } finally { release(); }
});

test('explicit replace and rename preserve identity, and deleting a view has preference-only Undo', async ({ page, isolatedLedger }, info) => {
  const origin = isolatedLedger.origin;
  for (const theme of ['light', 'dark'] as const) {
    const renamed = theme === 'light' ? 'W'.repeat(40) : 'M'.repeat(40);
    const read = await page.request.get(`${origin}/api/bookings/saved-views`);
    const state = await read.json() as { revision: string };
    const saved = await page.request.post(`${origin}/api/bookings/saved-views`, { headers: { origin }, data: {
      kind: 'save', revision: state.revision, view: { name: `Original ${theme}`, search: { q: 'Before', status: 'confirmed' } },
    } });
    expect(saved.status()).toBe(200);
    const created = (await saved.json()).views.find((view: { name: string }) => view.name === `Original ${theme}`) as { id: string };
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto('/konten/buchungen?q=Replacement&markierung=none');
    await page.locator('.kregister-actions summary').click();
    await page.getByRole('button', { name: 'Gespeicherte Ansichten', exact: true }).click();
    const manager = page.getByRole('dialog', { name: 'Gespeicherte Filteransichten', exact: true });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await manager.getByRole('button', { name: `Filter von Original ${theme} ersetzen`, exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Filteransicht speichern', exact: true });
    await expect(editor.getByLabel('Name', { exact: true })).toHaveValue(`Original ${theme}`);
    await editor.getByLabel('Name', { exact: true }).fill(renamed);
    await editor.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(editor).toBeHidden();
    const current = await page.request.get(`${origin}/api/bookings/saved-views`);
    expect((await current.json()).views.find((view: { id: string }) => view.id === created.id)).toEqual({ id: created.id, name: renamed, search: { markierung: 'none', q: 'Replacement' } });
    const actions = page.locator('.kregister-actions');
    if (await actions.getAttribute('open') === null) await actions.locator('summary').click();
    await page.getByRole('button', { name: 'Gespeicherte Ansichten', exact: true }).click();
    const remove = manager.getByRole('button', { name: `Ansicht ${renamed} löschen`, exact: true });
    if (info.project.name !== 'desktop') for (const button of await manager.locator('button:visible').all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await remove.click();
    await expect(remove).toHaveCount(0);
    await page.getByRole('button', { name: 'Rückgängig', exact: true }).last().click();
    await expect(manager.getByRole('button', { name: renamed, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(manager).toBeHidden();
  }
});

test('a real background refresh cannot rebase an open rename draft onto another client revision', async ({ page, browser, isolatedLedger }) => {
  const origin = isolatedLedger.origin;
  const state = await page.request.get(`${origin}/api/bookings/saved-views`);
  expect(state.status()).toBe(200);
  const originalSearch = { konto: 'original-account', q: 'Original criteria', status: 'pending' };
  const saved = await page.request.post(`${origin}/api/bookings/saved-views`, { headers: { origin }, data: {
    kind: 'save', revision: (await state.json()).revision, view: { name: 'Concurrent view', search: originalSearch },
  } });
  expect(saved.status()).toBe(200);
  const initial = await saved.json() as { revision: string; views: Array<{ id: string }> };
  const id = initial.views[0]!.id;
  await page.goto('/konten/buchungen?q=Different%20current%20URL');
  await page.locator('.kregister-actions summary').click();
  await page.getByRole('button', { name: 'Gespeicherte Ansichten', exact: true }).click();
  const manager = page.getByRole('dialog', { name: 'Gespeicherte Filteransichten', exact: true });
  await manager.getByRole('button', { name: 'Ansicht Concurrent view umbenennen', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Filteransicht speichern', exact: true });
  await editor.getByLabel('Name', { exact: true }).fill('Local rename draft');
  const other = await browser.newContext({ storageState: isolatedLedger.storageState, serviceWorkers: 'block' });
  try {
    const fresh = await other.request.get(`${origin}/api/bookings/saved-views`);
    expect(fresh.status()).toBe(200);
    expect((await fresh.json()).revision).toBe(initial.revision);
    const concurrentSearch = { konto: 'concurrent-account', q: 'Concurrent criteria', markierung: 'blue' };
    const changed = await other.request.post(`${origin}/api/bookings/saved-views`, { headers: { origin }, data: {
      kind: 'save', revision: initial.revision, id, view: { name: 'Server rename', search: concurrentSearch },
    } });
    expect(changed.status()).toBe(200);
    const current = await changed.json() as { revision: string };
    expect(current.revision).not.toBe(initial.revision);
    const refreshed = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/bookings/saved-views' && response.request().method() === 'GET' && response.status() === 200);
    // The application subscribes to this real visibility/focus path with refetchOnWindowFocus: always.
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    expect((await (await refreshed).json()).revision).toBe(current.revision);
    await expect(editor.getByLabel('Name', { exact: true })).toHaveValue('Local rename draft');
    await expect(editor.getByRole('button', { name: 'Speichern', exact: true })).toBeEnabled();
    const submitted = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/bookings/saved-views' && response.request().method() === 'POST');
    await editor.getByRole('button', { name: 'Speichern', exact: true }).click();
    expect((await submitted).status()).toBe(409);
    await expect(editor.getByRole('alert')).toContainText('Entwurf bleibt erhalten');
    await expect(editor.getByLabel('Name', { exact: true })).toHaveValue('Local rename draft');
    const preserved = await other.request.get(`${origin}/api/bookings/saved-views`);
    expect((await preserved.json()).views).toEqual([{ id, name: 'Server rename', search: concurrentSearch }]);
  } finally { await other.close(); }
});
