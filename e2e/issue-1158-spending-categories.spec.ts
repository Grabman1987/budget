import { chooseReportMenuView, expectReportMenuView } from './report-menu';
import AxeBuilder from '@axe-core/playwright';
import { expect, sampleTest as test } from './sample';
import { redesignReportsOn } from './report-frame';
import { withShellControls } from './shell-actions';

test('1158 category view retains period and selection through reload and report views', async ({
  page,
}, info) => {
  await page.goto('/reports/ausgaben?zeitraum=3M&darstellung=kategorien');
  if (!(await redesignReportsOn(page))) {
    await expect(page.getByTestId('spending-analysis')).toBeVisible();
    return;
  }
  await page.goto('/reports/kategorien?zeitraum=3M#details');
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === '/reports/ausgaben' &&
      url.searchParams.get('darstellung') === 'kategorien' &&
      url.searchParams.get('zeitraum') === '3M' &&
      url.hash === '#details',
  );
  await expectReportMenuView(page, 'Kategorien und Verlauf');
  await expect(page.getByRole('heading', { name: 'Kategorietrend', exact: true })).toBeVisible();
  await expect(page.locator('.rc-row').first()).toBeVisible();
  const total = await page.locator('.category-report .tbd-state').textContent();
  const result = await page.getByTestId('report-frame-result').textContent();
  expect(total).toContain(result);
  await page.getByText(/Kategorien wählen ·/).click();
  const choices = page.getByRole('group', { name: 'Kategorien vergleichen', exact: true });
  await choices.locator('input:not(:checked)').first().check();
  const selected = new URL(page.url()).searchParams.get('kategorien');
  expect(selected).not.toBeNull();
  await page.reload();
  await expectReportMenuView(page, 'Kategorien und Verlauf');
  expect(new URL(page.url()).searchParams.get('zeitraum')).toBe('3M');
  expect(new URL(page.url()).searchParams.get('kategorien')).toBe(selected);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`categories-${theme}.png`), fullPage: true });
  }
  await withShellControls(page, async ({ privacy }) => {
    await privacy.click();
  });
  await expect(page.locator('.category-report')).toContainText('•••');
  await expect(page.locator('.category-report')).not.toContainText(/\d[.,]\d{2}\s*€/);
  await withShellControls(page, async ({ privacy }) => {
    await privacy.click();
  });
  await chooseReportMenuView(page, 'Empfänger');
  await expect(page.getByTestId('payee-total')).toBeVisible();
  await chooseReportMenuView(page, 'Gruppen und Kategorien');
  await expect(page.getByTestId('spending-period-chart')).toBeVisible();
  await chooseReportMenuView(page, 'Kategorien und Verlauf');
  await expect(page.getByRole('heading', { name: 'Kategorietrend', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('zeitraum')).toBe('3M');
  expect(new URL(page.url()).searchParams.get('kategorien')).toBe(selected);
});
