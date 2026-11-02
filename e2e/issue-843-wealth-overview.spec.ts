import { sampleTest as test, expect } from './sample';

test('flagged overview separates total wealth, signed basis, chart and retained analysis', async ({
  page,
}) => {
  await page.goto('/vermoegen');
  const redesign = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  if (!redesign) {
    await expect(page).toHaveURL(/\/vermoegen\/nettovermoegen$/);
    await expect(page.getByTestId('nw-figure')).toBeVisible();
    return;
  }
  await expect(page.getByTestId('wealth-net-value')).toBeVisible();
  await expect(page.getByTestId('wealth-invested')).toBeVisible();
  await expect(page.getByTestId('wealth-compact-chart')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Weltaktienvergleich YTD' })).toBeVisible();
  await page.getByText('Nettovermögen und Verlauf im Detail').click();
  await expect(page.getByTestId('nw-figure')).toBeVisible();
  await page.goBack();
  await page.getByRole('link', { name: 'Ausgabenbasis und Annahmen öffnen →' }).click();
  await expect(page).toHaveURL(/\/vermoegen\/freiheit/);
});
