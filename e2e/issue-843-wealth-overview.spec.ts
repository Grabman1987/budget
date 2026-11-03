import { withShellControls } from './shell-actions';
import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, expect } from './sample';

test('flagged overview separates total wealth, signed basis, chart and retained analysis', async ({
  page,
}, info) => {
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
  await expect(page.getByTestId('wealth-compact-chart')).not.toContainText(/[-−]0 €/);
  await expect(page.getByRole('region', { name: 'Weltaktienvergleich YTD' })).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset['theme'] = value;
    }, theme);
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`wealth-overview-${theme}.png`),
      fullPage: true,
    });
  }
  await withShellControls(page, async ({ privacy }) => {
    await privacy.click();
  });
  await expect(page.getByTestId('wealth-net-value')).toContainText('•••');
  await expect(page.getByTestId('wealth-invested')).toContainText('•••');
  await expect(page.getByRole('region', { name: 'Weltaktienvergleich YTD' })).not.toContainText(
    /\d+,\d+ %/,
  );
  await withShellControls(page, async ({ privacy }) => {
    await privacy.click();
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByText('Datenbasis und bestehende Auswertungen', { exact: true }).click();
  await page.getByText('Nettovermögen und Verlauf im Detail').click();
  await expect(page.getByTestId('nw-figure')).toBeVisible();
  await page.goBack();
  await page.getByRole('link', { name: 'Report →', exact: true }).click();
  await expect(page).toHaveURL(/\/vermoegen\/freiheit/);
});
