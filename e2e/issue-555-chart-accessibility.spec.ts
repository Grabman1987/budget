import AxeBuilder from '@axe-core/playwright';
import { expect, sampleTest as test } from './sample';
import { eur } from '../apps/web/src/ledger/format';

test('existing report bars retain one data-rich image summary per shared chart', async ({
  page,
}) => {
  test.slow();
  for (const path of [
    '/reports/ausgaben',
    '/reports/budgettreue?monat=2026-08',
    '/reports/sparziele',
    '/reports/onepager?monat=2026-08',
  ]) {
    await page.goto(path);
    if (path === '/reports/sparziele') await page.locator('.goals tr.prow .pname').first().click();
    const charts = page.locator('.chart-interactive');
    await expect(charts.first()).toBeVisible();
    const imageCounts = await charts.evaluateAll((containers) =>
      containers.map(
        (container) =>
          Array.from(container.querySelectorAll('[role="img"]')).filter(
            (image) => image.closest('.chart-interactive') === container,
          ).length,
      ),
    );
    expect(imageCounts.every((count) => count === 1)).toBe(true);
    if (path.startsWith('/reports/onepager')) {
      await expect(page.getByTestId('onepager-split').getByRole('img')).toHaveAccessibleName(
        'Bedarf 54 %, Wunsch 34 %, Zukunft 26 %, Aus Guthaben 14 % der Einnahmen.',
      );
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
});

test('chart summary and exact-value alternative retain keyboard access in both themes', async ({
  page,
}, info) => {
  test.slow();
  const response = await page.request.get('/api/assets-debts-history?period=Alles');
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as {
    months: { month: string; assetsCents: number; debtsCents: number; netCents: number }[];
  };
  expect(data.months.length).toBeGreaterThan(0);
  await page.goto('/reports/vermoegen-schulden');
  const image = page.getByTestId('assets-debts-chart');
  await expect(image).toHaveAttribute('role', 'img');
  await expect(image).toHaveAccessibleName(/Nettovermögen von .* auf/);
  const disclosure = page.locator('.chart-data-table');
  const toggle = disclosure.locator('summary');
  const table = disclosure.getByRole('table');
  await expect(table).not.toBeVisible();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(table).toBeVisible();
  const expected = data.months.flatMap((month) => [
    ['Vermögenswerte', eur(month.assetsCents)],
    ['Schulden', eur(month.debtsCents)],
    ['Nettovermögen', eur(month.netCents)],
  ]);
  const values = await table
    .locator('tbody tr')
    .evaluateAll((rows) =>
      rows.map((row) => Array.from(row.querySelectorAll('td'), (cell) => cell.textContent)),
    );
  expect(values).toEqual(expected);
  await expect(table.locator('tbody tr')).toHaveCount(data.months.length * 3);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (info.project.name !== 'desktop') {
      const size = await toggle.boundingBox();
      expect(size!.width).toBeGreaterThanOrEqual(44);
      expect(size!.height).toBeGreaterThanOrEqual(44);
    }
    await toggle.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`chart-table-${theme}.png`), fullPage: true });
    await expect(disclosure).toHaveAttribute('open', '');
    await expect(table).toBeVisible();
  }
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(table).not.toBeVisible();
  await expect(toggle).toBeFocused();
});
