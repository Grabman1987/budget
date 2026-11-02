import { sampleTest as test, expect } from './sample';

test('debt actions preserve actual history and reveal existing scenarios without a write', async ({
  page,
}) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/') && !['GET', 'HEAD'].includes(request.method()))
      writes.push(request.url());
  });
  await page.goto('/vermoegen/schulden');
  await expect(page.getByTestId('debt-total')).toBeVisible();
  const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  if (on) {
    await expect(page.locator('.debt-rechenweg')).not.toHaveAttribute('open', '');
    await page.getByText('Schuldenverlauf · letzte 12 Monate', { exact: true }).click();
  }
  await expect(page.getByTestId('debt-history-chart')).toBeVisible();
  if (!on) await page.locator('.debt-rechenweg > summary').click();
  await expect(
    page.getByRole('heading', { name: 'Schulden nach Konto', exact: true }),
  ).toBeVisible();
  expect(writes).toEqual([]);
});
