import { sampleTest as test, expect } from './sample';

test('positions retain filtered activities, instrument returns and trade capture', async ({
  page,
}) => {
  await page.goto('/vermoegen/portfolio/positionen?zeitraum=1J');
  await expect(page.getByTestId('portfolio-value')).toBeVisible();
  const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  if (on) {
    await page.getByRole('combobox', { name: 'Anlageart', exact: true }).selectOption('krypto');
    await expect(page).toHaveURL(/anlageart=krypto/);
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Anlageart', exact: true })).toHaveValue(
      'krypto',
    );
    await page.getByRole('button', { name: 'Aktivitäten', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Aktivitäten', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Positionen', exact: true }).click();
    await page.getByRole('combobox', { name: 'Anlageart', exact: true }).selectOption('alle');
  }
  await page.locator('[data-portfolio-security="sec-etfw"]').first().click();
  await expect(page).toHaveURL(/\/instrument\/sec-etfw/);
  await page.getByRole('link', { name: 'Zurück zum Portfolio', exact: true }).click();
  await expect(page).toHaveURL(/\/positionen\?/);
  await expect(page).toHaveURL(/zeitraum=1J/);
  await page.getByRole('button', { name: 'Handel erfassen', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
