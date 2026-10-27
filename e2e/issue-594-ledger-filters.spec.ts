import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { test } from './isolated-ledger';

test('594 immediate URL filters, exact native sums, CSV and single-account Saldo', async ({ page, browser, isolatedLedger }, info) => {
  const origin = isolatedLedger.origin;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`${origin}/api${path}`, { headers: { origin }, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const eur = (await post('/accounts', { name: 'Synthetic EUR', type: 'checking', openingDate: '2026-09-01' })).account;
  const usd = (await post('/accounts', { name: 'Synthetic USD', type: 'other_asset', onBudget: false, currency: 'USD', openingDate: '2026-09-01' })).account;
  const ids: string[] = [];
  for (const amountCents of [-1234, 567, -890]) ids.push((await post('/bookings', {
    type: 'booking', accountId: eur.id, date: '2026-10-02', amountCents, memo: 'Synthetic filter', status: 'pending', flag: 'blue',
  })).id);
  await post('/bookings', { type: 'booking', accountId: usd.id, date: '2026-10-02', amountCents: -4321, memo: 'Synthetic filter', status: 'pending', flag: 'blue' });
  await post('/bookings', { type: 'booking', accountId: eur.id, date: '2026-10-02', amountCents: -9999, memo: 'Excluded' });
  await post('/bookings', { type: 'booking', accountId: eur.id, date: '2026-11-02', amountCents: -555, memo: 'Synthetic filter', status: 'pending' });
  await page.goto('/konten/buchungen');
  const search = page.getByLabel('In Buchungen suchen');
  await search.fill('Synthetic filter');
  await expect(page.locator('.ksum')).toContainText('4 Buchungen');
  await expect(page.locator('.ksum')).toContainText('−15,57 €');
  await expect(page.locator('.ksum')).toContainText('USD');
  await expect(page.locator('.ksum')).toContainText('43,21');
  await expect(page.locator('.ktx-all thead th').filter({ hasText: /^Saldo$/ })).toHaveCount(0);
  const upcoming = page.locator('.kupcoming-toggle');
  await expect(upcoming).toHaveAttribute('aria-expanded', 'false');
  const trigger = page.getByRole('button', { name: /^Filter \(/ });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Buchungen filtern', exact: true });
  await expect(dialog.getByRole('button', { name: 'Anwenden', exact: true })).toHaveCount(0);
  await dialog.getByLabel('Konto', { exact: true }).selectOption(eur.id);
  await expect(page).toHaveURL(new RegExp(`konto=${eur.id}`));
  await dialog.getByLabel('Von', { exact: true }).fill('2026-10-02');
  await dialog.getByLabel('Bis', { exact: true }).fill('2026-10-02');
  await dialog.getByLabel('Status', { exact: true }).selectOption('pending');
  await dialog.getByLabel('Markierung', { exact: true }).selectOption('blue');
  await expect(page).toHaveURL(/markierung=blue/);
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (info.project.name !== 'desktop') for (const control of await dialog.locator('input:visible, select:visible, button:visible').all()) {
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: info.outputPath(`filters-${info.project.name}-${theme}.png`), fullPage: false, animations: 'disabled' });
  }
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.locator('.ksum')).toContainText('3 Buchungen');
  await expect(page.locator('.ksum')).toContainText('−15,57 €');
  await expect(page.locator('.ktx-all thead th').filter({ hasText: /^Saldo$/ })).toHaveCount(1);
  const url = page.url();
  await page.reload();
  await expect.poll(async () => new Set(await page.locator('tr[data-booking]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-booking'))))).toEqual(new Set(ids));
  const second = await browser.newContext({ storageState: isolatedLedger.storageState, viewport: page.viewportSize()!, serviceWorkers: 'block' });
  try {
    const other = await second.newPage();
    await other.clock.setFixedTime(new Date('2026-10-02T12:00:00+02:00'));
    await other.goto(url);
    await expect.poll(async () => new Set(await other.locator('tr[data-booking]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-booking'))))).toEqual(new Set(ids));
    await expect(other.locator('.ksum')).toContainText('−15,57 €');
  } finally { await second.close(); }
  await page.locator('.kregister-actions summary').click();
  const link = page.getByRole('link', { name: 'Aktuellen Filter als CSV exportieren' });
  const csv = await page.request.get((await link.getAttribute('href'))!);
  expect(csv.ok()).toBe(true);
  const lines = (await csv.text()).replace(/^\uFEFF/, '').trimEnd().split('\r\n');
  expect(lines).toHaveLength(4);
  expect(new Set(lines.slice(1).map((line) => line.split(';')[0]?.replaceAll('"', '')))).toEqual(new Set(ids));
  await page.getByRole('button', { name: 'Konto: Synthetic EUR entfernen', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).not.toHaveURL(/konto=/);
  await expect(page.locator('.ktx-all thead th').filter({ hasText: /^Saldo$/ })).toHaveCount(0);
});
