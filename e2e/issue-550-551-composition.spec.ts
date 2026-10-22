import AxeBuilder from '@axe-core/playwright';
import type { AssetCompositionPoint } from '@budget/domain';
import { expect, sampleTest as test } from './sample';

for (const theme of ['light', 'dark'] as const) {
  test(`asset groups and monthly history preserve dated values and privacy in ${theme}`, async ({
    page,
    isMobile,
  }, info) => {
    await page.goto('/vermoegen/nettovermoegen');
    await page.evaluate((selected) => {
      document.documentElement.dataset['theme'] = selected;
    }, theme);
    await expect(
      page.getByRole('heading', { name: 'Woraus es besteht', exact: true }),
    ).toBeVisible();
    const response = await page.request.get('/api/wealth/networth?period=YTD');
    expect(response.status()).toBe(200);
    const view = (await response.json()) as {
      chain: { nowCents: number };
      daily: { date: string; netWorthCents: number }[];
      assetComposition: AssetCompositionPoint;
      assetCompositionHistory: AssetCompositionPoint[];
    };
    expect(view.chain.nowCents).toBe(8473000);
    expect(view.daily.at(-1)).toEqual({ date: '2026-09-17', netWorthCents: 8473000 });
    expect(view.assetComposition.totalCents).toBe(8473000);
    expect(view.assetComposition.groups.reduce((sum, g) => sum + g.valueCents!, 0)).toBe(8473000);
    expect(view.assetCompositionHistory.map((p) => p.asOf)).toEqual([
      '2025-12-31',
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
      '2026-07-31',
      '2026-08-31',
      '2026-09-17',
    ]);
    for (const point of view.assetCompositionHistory) {
      expect(point.groups.reduce((sum, g) => sum + g.valueCents!, 0)).toBe(point.totalCents);
      expect(point.totalCents).toBe(view.daily.find((p) => p.date === point.asOf)?.netWorthCents);
    }
    await expect(page.getByTestId('nw-figure')).toContainText('84.730');
    const composition = page.locator('.asset-composition');
    for (const label of [
      'Konten & Bargeld',
      'Wertpapiere',
      'Depot-Bargeld',
      'Krypto',
      'P2P/Sonstiges',
      'Schulden',
    ]) {
      await expect(composition.locator('summary').filter({ hasText: label })).toBeVisible();
    }
    await composition.locator('summary').filter({ hasText: 'Schulden' }).click();
    await expect(
      composition.getByRole('table', { name: 'Kontobeiträge zu Schulden' }),
    ).toBeVisible();
    const links = composition
      .getByRole('table', { name: 'Kontobeiträge zu Schulden' })
      .getByRole('link');
    expect(await links.count()).toBeGreaterThan(0);
    await expect(links.first()).toHaveAttribute('href', /^\/konten\//);
    await page.getByRole('button', { name: 'Nach Konto', exact: true }).click();
    await expect(
      composition.getByRole('table', { name: 'Ganze Kontowerte am gewählten Stichtag' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Nach Vermögensart', exact: true }).click();
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Zusammensetzung', exact: true }).click();
    const svg = page.getByTestId('asset-composition-chart');
    await expect(svg).toBeVisible();
    const chart = page.locator('.chart-interactive').filter({ has: svg });
    await chart.focus();
    for (let i = 1; i < view.assetCompositionHistory.length; i++) await chart.press('ArrowRight');
    await expect(page.locator('.chart-tooltip[role="status"]')).toContainText('17.09.2026');
    await expect(page.locator('.chart-tooltip[role="status"]')).toContainText('84.730,00');
    const lastValues = await page
      .locator('.chart-tooltip[role="status"]')
      .locator('.chart-tooltip-row strong')
      .allTextContents();
    await chart.press('Escape');
    await page.locator('.chart-data-table > summary').click();
    const table = page.locator('.chart-data-table');
    for (const value of lastValues) await expect(table).toContainText(value);
    await expect(
      table.getByRole('row').filter({ hasText: '17.09.2026' }).filter({ hasText: 'Nettovermögen' }),
    ).toContainText('84.730,00');
    const debt = svg.locator('path[stroke="var(--ink-2)"]').last();
    await expect(debt).toHaveAttribute('fill', 'none');
    await expect(debt).toHaveAttribute('stroke-dasharray', '7 5');
    const axisLabels = await svg.locator('text.svg-label').evaluateAll((nodes) =>
      nodes
        .filter((n) => n.getAttribute('y') === '314')
        .map((n) => {
          const box = n.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            size: Number.parseFloat(getComputedStyle(n).fontSize),
          };
        }),
    );
    for (let i = 1; i < axisLabels.length; i++)
      expect(axisLabels[i]!.left).toBeGreaterThanOrEqual(axisLabels[i - 1]!.right);
    expect(axisLabels.every((l) => l.size >= 11)).toBe(true);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    if (isMobile) {
      const small = await page
        .locator(
          'main .composition-switch button, .asset-composition summary, .asset-composition a, .chart-data-table summary',
        )
        .evaluateAll((nodes) =>
          nodes
            .filter((n) => n.getClientRects().length)
            .map((n) => ({
              text: n.textContent,
              width: n.getBoundingClientRect().width,
              height: n.getBoundingClientRect().height,
            }))
            .filter((r) => r.width < 44 || r.height < 44),
        );
      expect(small).toEqual([]);
      const box = await svg.boundingBox();
      await svg.tap({ position: { x: box!.width - 15, y: 80 } });
      await expect(page.locator('.chart-tooltip[role="status"]')).toContainText('84.730,00');
    }
    await page.keyboard.press('Control+Shift+H');
    await expect(page.getByTestId('nw-figure')).toContainText('•••');
    await expect(table).not.toContainText('84.730');
    await expect(composition).not.toContainText('84.730');
    await chart.focus();
    await chart.press('ArrowRight');
    await expect(page.locator('.chart-tooltip[role="status"]')).not.toContainText('84.730');
    expect(await page.locator('main').textContent()).not.toMatch(/\d[\d.,]*\s*%/);
    await page.keyboard.press('Control+Shift+H');
    await expect(page.getByTestId('nw-figure')).toContainText('84.730');
    await chart.press('Escape');
    await page.locator('.chart-data-table > summary').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath(`composition-${info.project.name}-${theme}.png`),
      fullPage: true,
    });
  });
}
