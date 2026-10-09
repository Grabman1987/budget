import AxeBuilder from '@axe-core/playwright';
import { expect, sampleTest as test } from './sample';

test('instrument pages restore portfolio scroll and use modal forms', async ({ page }, info) => {
  await page.goto('/vermoegen/portfolio?zeitraum=1J');
  const trigger = page.locator('[data-portfolio-security]').last();
  await trigger.scrollIntoViewIfNeeded();
  const id = await trigger.getAttribute('data-portfolio-security');
  const scroll = await page.evaluate(() => window.scrollY);
  expect(scroll).toBeGreaterThan(0);
  await trigger.click();
  await expect(page).toHaveURL(new RegExp(`/vermoegen/portfolio/instrument/${id}\\?zeitraum=1J$`));
  const url = page.url();
  await expect(page.getByRole('navigation', { name: 'Brotkrumen' })).toContainText('Portfolio');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Stammdaten bearbeiten', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Stammdaten bearbeiten', exact: true });
  await expect(form).toBeVisible();
  await expect(page.locator('dialog.panel[open]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(form).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Stammdaten bearbeiten', exact: true }),
  ).toBeFocused();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => (document.documentElement.dataset['theme'] = value), theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    await page.screenshot({ path: info.outputPath(`instrument-${theme}.png`), fullPage: true });
  }
  await page.getByRole('link', { name: 'Zurück zum Portfolio' }).click();
  await expect(page).toHaveURL(/\/vermoegen\/portfolio\?zeitraum=1J$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(scroll, 0);
  await page.goto(url);
  await expect(
    page.getByRole('button', { name: 'Stammdaten bearbeiten', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Zurück zum Portfolio' }).click();
  await expect(page).toHaveURL(/\/vermoegen\/portfolio\?zeitraum=1J$/);
  await page.goto('/vermoegen/portfolio/instrument/unknown-synthetic-instrument');
  await expect(page.getByText(/Instrumentdaten konnten nicht geladen/)).toBeVisible();
});

test('savings-plan history restores browser navigation and portfolio scroll', async ({ page }) => {
  await page.goto('/vermoegen/portfolio?zeitraum=3J');
  const trigger = page.locator('[data-savings-plan]:not([data-savings-plan="neu"])').last();
  await trigger.scrollIntoViewIfNeeded();
  const id = await trigger.getAttribute('data-savings-plan');
  const scroll = await page.evaluate(() => window.scrollY);
  expect(id).toBeTruthy();
  expect(scroll).toBeGreaterThan(0);
  await trigger.click();
  await expect(page).toHaveURL(new RegExp(`/vermoegen/portfolio/sparplan/${id}\\?zeitraum=3J$`));
  await expect(
    page.getByRole('region', { name: 'Versionsverlauf' }).getByRole('listitem'),
  ).toHaveCount(2);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/vermoegen\/portfolio\?zeitraum=3J$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(scroll, 0);
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/vermoegen/portfolio/sparplan/${id}\\?zeitraum=3J$`));
  await expect(
    page.getByRole('region', { name: 'Versionsverlauf' }).getByRole('listitem'),
  ).toHaveCount(2);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Zurück zum Portfolio' }).click();
  await expect(page).toHaveURL(/\/vermoegen\/portfolio\?zeitraum=3J$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(scroll, 0);
});

test('net worth composition follows the full-width lead', async ({ page }, info) => {
  await page.goto('/vermoegen/nettovermoegen');
  const lead = await page.locator('.vview .vnw').boundingBox();
  const composition = await page.locator('.vview .vcomp').boundingBox();
  expect(lead && composition && composition.y >= lead.y + lead.height).toBe(true);
  expect(composition!.width).toBeCloseTo(lead!.width, 0);
  await page.screenshot({ path: info.outputPath('networth-sections.png'), fullPage: true });
});
