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
  const view = page.getByRole('combobox', { name: 'Ansicht der Ausgabenanalyse', exact: true });
  await expect(view).toHaveValue('kategorien');
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
  await expect(view).toHaveValue('kategorien');
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
  await view.selectOption('empfaenger');
  await expect(page.getByTestId('payee-total')).toBeVisible();
  await view.selectOption('gruppen');
  await expect(page.getByTestId('spending-period-chart')).toBeVisible();
  await view.selectOption('kategorien');
  await expect(page.getByRole('heading', { name: 'Kategorietrend', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('zeitraum')).toBe('3M');
  expect(new URL(page.url()).searchParams.get('kategorien')).toBe(selected);
});
