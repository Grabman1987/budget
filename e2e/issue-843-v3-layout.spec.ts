import { mkdirSync } from 'node:fs';
import { sampleTest as test, expect } from './sample';

const pages = [
  ['uebersicht', '/vermoegen', 'Zusammensetzung nach Anlageart'],
  ['positionen', '/vermoegen/portfolio/positionen', 'Positionen nach Anlageart'],
  ['sparplaene', '/vermoegen/portfolio/sparplaene', 'Monatlich gesamt'],
  ['allokation', '/vermoegen/portfolio/allokation', 'Ist, Ziel und Abweichung'],
  ['schulden', '/vermoegen/schulden', 'Schulden nach Konto'],
] as const;
for (const [name, route, heading] of pages) {
  test(`v3 ${name}: section structure and responsive width`, async ({ page }, info) => {
    await page.goto(route);
    if ((await page.locator('.app').getAttribute('data-budget-redesign')) !== '1') {
      await expect(page.locator('main')).toBeVisible();
      await expect(page.locator('[data-testid="wealth-redesign"]')).toHaveCount(0);
      return;
    }
    await expect(page.getByTestId('wealth-redesign')).toBeVisible();
    await expect(page.locator('main').getByText(heading, { exact: true }).first()).toBeAttached();
    await expect(page.locator('.wealth-toolbar')).toBeVisible();
    const investment = page.locator('.wealth-investment > summary');
    await expect(investment).toBeVisible();
    const investmentBox = (await investment.boundingBox())!;
    expect(investmentBox.width).toBeGreaterThanOrEqual(44);
    expect(investmentBox.height).toBeGreaterThanOrEqual(44);
    expect(investmentBox.x).toBeGreaterThanOrEqual(0);
    expect(investmentBox.x + investmentBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    if (name === 'uebersicht') {
      await expect(page.getByTestId('wealth-compact-chart')).toBeVisible();
      await expect(page.getByRole('group', { name: 'Zeitraum', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Als Nächstes' })).toBeVisible();
    }
    if (process.env['WEALTH_EVIDENCE_DIR']) {
      mkdirSync(process.env['WEALTH_EVIDENCE_DIR'], { recursive: true });
      await page.screenshot({
        path: `${process.env['WEALTH_EVIDENCE_DIR']}/${name}-${info.project.name === 'desktop' ? '1440' : '390'}-light.png`,
        animations: 'disabled',
        fullPage: true,
      });
    }
  });
}

test('v3 instrument: value, transactions and master data share the existing detail', async ({
  page,
}, info) => {
  await page.goto('/vermoegen/portfolio/instrument/sec-etfw');
  if ((await page.locator('.app').getAttribute('data-budget-redesign')) !== '1') return;
  await expect(page.getByRole('heading', { name: 'ETF Welt', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wert und Einstand' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Transaktionen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stammdaten', exact: true })).toBeVisible();
  await expect(page.getByTestId('instrument-value-chart')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  if (process.env['WEALTH_EVIDENCE_DIR'])
    await page.screenshot({
      path: `${process.env['WEALTH_EVIDENCE_DIR']}/instrument-${info.project.name === 'desktop' ? '1440' : '390'}-light.png`,
      animations: 'disabled',
      fullPage: true,
    });
});
