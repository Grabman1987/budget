import { sampleTest as test, expect } from './sample';

test('allocation uses one settings editor and returns to the original selection; schedules keep capture', async ({
  page,
}) => {
  await page.goto('/vermoegen/portfolio/allokation?zeitraum=1J');
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
  await page.locator('[data-savings-plan="neu"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  if (on)
    await expect(page.getByRole('region', { name: 'Fällige Sparplanausführungen' })).toBeVisible();
});
