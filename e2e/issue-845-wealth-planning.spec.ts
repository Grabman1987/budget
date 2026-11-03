import { showAllocationEvidence } from './wealth-navigation';
import { sampleTest as test, expect } from './sample';

test('allocation uses one settings editor and returns to the original selection; schedules keep capture', async ({
  page,
}) => {
  await page.goto('/vermoegen/portfolio/allokation?zeitraum=1J');
  await showAllocationEvidence(page);
  await expect(
    page.getByRole('button', { name: 'Sollquoten bearbeiten', exact: true }),
  ).toBeVisible();
  const on = (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
  if (on)
    await page
      .getByRole('combobox', { name: 'Anlageart', exact: true })
      .selectOption('wertpapiere');
  const before = page.url();
  await page.getByRole('button', { name: 'Sollquoten bearbeiten', exact: true }).click();
  await expect(page).toHaveURL(/\/einstellungen\/anlageklassen\?panel=sollquoten/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(before);
  await page.goto('/vermoegen/portfolio/sparplaene?zeitraum=1J');
  if (on) {
    await page.getByRole('combobox', { name: 'Anlageart', exact: true }).selectOption('krypto');
    await page.locator('[data-savings-plan]:not([data-savings-plan="neu"])').first().click();
    await expect(page).toHaveURL(/\/sparplan\//);
    await expect(page).toHaveURL(/anlageart=krypto/);
    await page.getByRole('link', { name: 'Zurück zum Portfolio', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Anlageart', exact: true })).toHaveValue(
      'krypto',
    );
  }
  await page.locator('[data-savings-plan="neu"]:visible').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  if (on) {
    const investment = page.locator('.wealth-investment > summary');
    await investment.click();
    await page.getByRole('link', { name: 'Sparplan anlegen', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(investment).toBeFocused();
    await page.locator('summary').getByText('Ausführungen prüfen', { exact: true }).click();
    await expect(page.getByRole('region', { name: 'Fällige Sparplanausführungen' })).toBeVisible();
  }
});
