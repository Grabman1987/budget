import AxeBuilder from '@axe-core/playwright';
import type { PaymentsPreview } from '@budget/domain';
import { expect, sampleTest as test } from './sample';

test.describe.configure({ timeout: 90_000 });

// The retired calendar renderer's literal money/range/precision/retry checks now live in
// payments-preview-retained-620.test.tsx; domain/API no-write and date oracles remain unchanged.
test('preview bookmark opens Plan payments, while the real twelve-month API stays read-only', async ({ page }, info) => {
  const response = await page.request.get('/api/expected/year-preview');
  expect(response.status()).toBe(200);
  const data = (await response.json()) as PaymentsPreview;
  expect([data.from, data.to]).toEqual(['2026-10-01', '2027-09-30']);
  expect(data.months).toHaveLength(12);
  expect(data.rows.length).toBeGreaterThan(0);
  for (const currency of data.currencies) {
    expect(currency.months).toHaveLength(12);
    expect(currency.months.reduce((sum, month) => sum + month.baseCents, 0)).toBe(currency.total.baseCents);
  }
  const writes: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/') && r.method() !== 'GET') writes.push(new URL(r.url()).pathname);
  });
  await page.goto('/reports/vorschau?monat=2026-09');
  await expect(page).toHaveURL(/\/plan\/erwartet\?monat=2026-09$/);
  await expect(page.locator('tr.prow', { hasText: 'Gehalt' }).first()).toContainText('+3.812,00 €');
  await expect(page.locator('tr.prow', { hasText: 'Miete' }).first()).toContainText('Do 01.10.');
  const contracts = page.getByRole('button', { name: 'Verträge und Abos', exact: true });
  await contracts.focus();
  await page.keyboard.press('Enter');
  await expect(contracts).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('tr.prow', { hasText: 'KI-Assistent' })).toContainText('20,00 $ je Zahlung');
  await expect(page.locator('tr.prow', { hasText: 'Strom' })).toContainText('−1.260 €');
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse), (max-width: 767px)').matches);
  // DESIGN's compact segmented control is 28px; the shared touch floor is 44px.
  if (touch) expect((await contracts.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  else expect((await contracts.boundingBox())!.height).toBe(28);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`preview-destination-${theme}.png`), fullPage: true, animations: 'disabled' });
  }
  // Plan's existing idempotent occurrence refresh is permitted; navigation must not book money.
  expect(writes.filter((path) => path !== '/api/expected/refresh')).toEqual([]);
  await page.reload();
  await expect(page).toHaveURL(/\/plan\/erwartet\?monat=2026-09$/);
  await expect(page.getByRole('button', { name: 'Verträge und Abos', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
