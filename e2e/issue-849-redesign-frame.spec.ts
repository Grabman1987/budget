import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sampleTest as test, expect } from './sample';

const reports = [
  ['month', '/reports/onepager?monat=2026-08', 'Berechnung Planabweichung'],
  ['year', '/reports/jahresreport', 'Berechnung Jahresergebnis'],
  ['compare', '/reports/vergleich', 'Berechnung Zeitraumvergleich'],
] as const;
for (const [name, path, chain] of reports)
  test(`${name}: shared calculation head, controls, source and accessible detail`, async ({
    page,
  }, info) => {
    if (info.project.name !== 'desktop') await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await expect(page.locator('.app')).toBeVisible();
    const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
    if (!on) {
      await expect(page.locator('.titleblock')).toBeVisible();
      await expect(page.getByTestId('redesign-report-head')).toHaveCount(0);
      return;
    }
    const head = page.getByTestId('redesign-report-head');
    await expect(head.getByRole('group', { name: chain, exact: true })).toBeVisible();
    await expect(page.getByTestId('report-frame-result')).not.toHaveText('—');
    await expect(page.getByTestId('report-frame-source')).toContainText('Stand');
    if (name === 'month') {
      await expect(page.getByRole('group', { name: 'Monat', exact: true })).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Drucken', exact: true })).toBeVisible();
    }
    if (name === 'year')
      await expect(head.getByRole('group', { name: 'Jahr', exact: true })).toHaveCount(1);
    if (name === 'compare')
      await expect(head.getByRole('combobox', { name: 'Vergleich', exact: true })).toHaveCount(1);
    for (const button of await head.getByRole('button').all()) {
      expect(
        await button.evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
      ).toBe(true);
    }
    const detail = page.locator('.redesign-report-detail');
    await detail.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(detail).toHaveAttribute('open', '');
    await expect(detail.locator('dl')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(detail.locator('summary')).toBeFocused();
    await detail.locator('summary').evaluate((element) => (element as HTMLElement).blur());
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((value) => {
        document.documentElement.dataset['theme'] = value;
      }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      const folder = info.outputPath('report-frame');
      mkdirSync(folder, { recursive: true });
      if (info.project.name !== 'webkit-iphone')
        await page.screenshot({
          path: join(folder, `r2-${name}-${info.project.name}-${theme}.png`),
          fullPage: true,
        });
    }
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

test('invalid report keeps its recovery link in both builds', async ({ page }) => {
  await page.goto('/reports/unknown-synthetic-report');
  await expect(page.getByText('Report nicht gefunden', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Zum Katalog', exact: true })).toHaveAttribute(
    'href',
    '/reports',
  );
});

test('missing, loading and failed reads never become a zero lead, and retry keeps the real reader', async ({
  page,
}, info) => {
  if (info.project.name !== 'desktop') await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/reports/onepager?monat=2000-01');
  await expect(page.getByText(/gibt es keine Aufzeichnungen/)).toBeVisible();
  const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  if (on) {
    await expect(page.getByRole('button', { name: 'Drucken', exact: true })).toBeDisabled();
    await expect(page.getByTestId('report-frame-result')).toHaveText('—');
    await expect(page.getByTestId('report-calculation').getByRole('group')).toHaveCount(0);
    if (info.project.name !== 'webkit-iphone')
      await page.screenshot({
        path: info.outputPath('report-frame-empty.png'),
        fullPage: true,
      });
  }
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/reports/month/onepager?*', async (route) => {
    await held;
    await route.fulfill({ status: 503, json: { error: 'synthetic_unavailable' } });
  });
  try {
    await page.goto('/reports/onepager?monat=2026-08');
    await expect(
      page.getByText('Daten des Monatsblatts werden geladen …', { exact: true }),
    ).toBeVisible();
    if (on) await expect(page.getByTestId('report-frame-result')).toHaveText('—');
  } finally {
    release();
  }
  await expect(page.getByRole('alert')).toBeVisible();
  if (on) {
    await expect(page.getByRole('button', { name: 'Drucken', exact: true })).toBeDisabled();
    await expect(page.getByTestId('report-frame-result')).toHaveText('—');
    if (info.project.name !== 'webkit-iphone')
      await page.screenshot({
        path: info.outputPath('report-frame-error.png'),
        fullPage: true,
      });
  }
  await page.unroute('**/api/reports/month/onepager?*');
  await page.getByRole('button', { name: /Erneut versuchen/ }).click();
  await expect(page.getByTestId(on ? 'r5-month-saved' : 'onepager-saved')).toBeVisible();
  if (on) await expect(page.getByTestId('report-frame-result')).not.toHaveText('—');
});
