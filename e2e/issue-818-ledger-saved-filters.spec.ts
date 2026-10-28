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
  }
  expect(writes).toEqual([]);
});
