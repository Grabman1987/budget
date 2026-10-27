import AxeBuilder from '@axe-core/playwright';
import type { AssetCompositionPoint } from '@budget/domain';
import { expect, type Page } from '@playwright/test';
import { test } from './isolated-ledger';
test.use({ ledgerToday: '2026-03-01' });

async function privacy(page: Page, hidden: boolean) {
  const profile = page.locator('.m-profile summary');
  if (await profile.isVisible()) await profile.click();
  const button = page.getByRole('button', { name: 'Beträge verbergen', exact: true });
  await expect(button).toHaveAttribute('aria-pressed', String(!hidden));
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', String(hidden));
  if (await profile.isVisible()) await profile.click();
}
test('550/551 literal signed composition reconciles lead, monthly chart, accounts and private accessible values', async ({ page, request, baseURL }, info) => {
  for (const data of [
    { name: 'Synthetic asset', type: 'checking', openingBalanceCents: 1_000_000 },
    { name: 'Synthetic debt', type: 'loan', openingBalanceCents: -200_000 },
  ]) {
    const response = await request.post('/api/accounts', { headers: { origin: baseURL! }, data: { ...data, openingDate: '2026-01-01' } });
    expect(response.ok(), await response.text()).toBe(true);
  }
  await page.goto('/vermoegen/nettovermoegen?zeitraum=YTD');
  await expect(page.getByTestId('nw-figure')).toHaveText('8.000,00 €');
  const response = await request.get('/api/wealth/networth?period=YTD');
  expect(response.ok()).toBe(true);
  const view = await response.json() as { chain: { nowCents: number }; daily: { date: string; netWorthCents: number }[]; assetComposition: AssetCompositionPoint; assetCompositionHistory: AssetCompositionPoint[] };
  expect(view.chain.nowCents).toBe(800_000);
  expect(view.assetComposition.totalCents).toBe(800_000);
  expect(view.assetComposition.asOf).toBe('2026-03-01');
  expect(view.assetCompositionHistory.map((p) => p.asOf)).toEqual(['2026-01-01', '2026-01-31', '2026-02-28', '2026-03-01']);
  for (const p of view.assetCompositionHistory) {
    expect(p.groups.reduce((sum, g) => sum + g.valueCents!, 0)).toBe(800_000);
    expect(view.daily.find((d) => d.date === p.asOf)?.netWorthCents).toBe(800_000);
  }
  const composition = page.locator('.asset-composition');
  const cash = composition.locator('[data-asset-group="cash"]');
  const debt = composition.locator('[data-asset-group="debt"]');
  await expect(cash.locator(':scope > summary .asset-composition-value')).toHaveText('10.000,00 €');
  await expect(cash.locator(':scope > summary small')).toHaveText('125,0 %');
  await expect(debt.locator(':scope > summary .asset-composition-value')).toHaveText('−2.000,00 €');
  await expect(debt.locator(':scope > summary small')).toHaveText('−25,0 %');
  await cash.locator(':scope > summary').click();
  await expect(cash.getByRole('link', { name: 'Synthetic asset', exact: true })).toHaveAttribute('href', /\/konten\//);
  const accountLink = (await cash.getByRole('link', { name: 'Synthetic asset', exact: true }).boundingBox())!;
  expect(accountLink.width).toBeGreaterThanOrEqual(44);
  expect(accountLink.height).toBeGreaterThanOrEqual(44);
  await cash.locator(':scope > summary').click();
  await composition.getByRole('button', { name: 'Nach Konto', exact: true }).click();
  await expect(composition.locator('tbody tr')).toHaveCount(2);
  await expect(composition.locator('tbody .asset-composition-value')).toHaveText(['10.000,00 €', '−2.000,00 €']);
  await composition.getByRole('button', { name: 'Nach Vermögensart', exact: true }).click();
  await page.getByRole('button', { name: 'Zusammensetzung', exact: true }).click();
  const drawingSvg = page.getByTestId('asset-composition-chart');
  await expect(drawingSvg).toBeVisible();
  const chart = page.locator('.asset-history');
  const debtShape = chart.locator('[data-composition-key="debt"]');
  const debtGeometry = await debtShape.evaluate((group) => {
    const zero = Number(group.getAttribute('data-zero-y'));
    const ys = [...group.querySelectorAll('path')].flatMap((path) => (path.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((_v, index) => index % 2 === 1));
    return { zero, ys };
  });
  expect(debtGeometry.ys.length).toBeGreaterThan(0);
  expect(debtGeometry.ys.every((y) => y >= debtGeometry.zero)).toBe(true);
  expect(debtGeometry.ys.some((y) => y > debtGeometry.zero)).toBe(true);
  const interactive = chart.locator('.chart-interactive');
  await interactive.focus();
  for (let i = 0; i < 3; i++) await interactive.press('ArrowRight');
  const tooltip = chart.locator('.chart-tooltip');
  await expect(tooltip).toContainText('01.03.2026');
  await expect(tooltip).toContainText('10.000,00 € · 125,0 %');
  await expect(tooltip).toContainText('−2.000,00 € · −25,0 %');
  await expect(tooltip.locator('.chart-tooltip-row').filter({ hasText: 'Nettovermögen' }).locator('strong')).toHaveText('8.000,00 €');
  const keyboardText = await tooltip.innerText();
  // Pointer parity is checked at the actual last plot x, independent of a fixed desktop width.
  const drawing = (await drawingSvg.boundingBox())!;
  await page.mouse.move(drawing.x + drawing.width - 15, drawing.y + drawing.height / 2);
  await expect(tooltip).toHaveText(keyboardText);
  await chart.locator('.chart-data-table summary').click();
  const lastNet = chart.locator('.chart-data-table tr').filter({ hasText: '01.03.2026' }).filter({ hasText: 'Nettovermögen' });
  await expect(lastNet.locator('td').last()).toHaveText('8.000,00 €');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => { document.documentElement.dataset['theme'] = value; }, theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (info.project.name !== 'desktop') {
      for (const control of await page.locator('.asset-composition button:visible, .asset-composition summary:visible, .asset-history summary:visible').all()) {
        const box = (await control.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }
    await privacy(page, true);
    await expect(cash.locator(':scope > summary .asset-composition-value')).toHaveText('••• €');
    await expect(cash.locator(':scope > summary small')).not.toContainText('125,0');
    await expect(lastNet.locator('td').last()).toHaveText('••• €');
    await interactive.focus();
    await interactive.press('ArrowRight');
    await expect(tooltip).not.toContainText('8.000,00');
    await expect(tooltip).not.toContainText('125,0');
    await privacy(page, false);
    await chart.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`asset-composition-${theme}.png`), fullPage: false });
  }
  await page.getByRole('button', { name: 'Gesamt', exact: true }).click();
  await expect(page.getByTestId('networth-chart')).toBeVisible();
  await expect(page.getByTestId('nw-figure')).toHaveText('8.000,00 €');
});
