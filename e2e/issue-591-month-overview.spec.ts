import AxeBuilder from '@axe-core/playwright';
import type { BudgetMonthView } from '../apps/web/src/budget/budget-api';
import { expect, sampleTest as test } from './sample';

test('591 no-selection overview preserves cents, canonical target shortfalls and device disclosure choices', async ({ page }, info) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('591-initialized')) {
      localStorage.removeItem('budget.plan.overview');
      localStorage.setItem('budget.plan.months', '1');
      sessionStorage.setItem('591-initialized', '1');
    }
  });
  await page.route('**/api/budget/2026-10', async (route) => {
    const response = await route.fetch();
    const view = await response.json() as BudgetMonthView;
    view.summary.envelopes = view.summary.envelopes.map((row, index) => ({
      ...row,
      target: index < 2 ? { id: `target-${index}`, categoryId: row.categoryId, kind: 'monthly', amountCents: 10000, everyMonths: 1, targetDate: null, dueDay: null, validFrom: '2026-10' } : null,
      goalCents: index < 2 ? 10000 : 0,
      assignedCents: index === 0 ? 15000 : index === 1 ? 5000 : row.assignedCents,
      needCents: index === 1 ? 5000 : 0,
    }));
    await route.fulfill({ response, json: view });
  });
  await page.goto('/plan/monat?monat=2026-09');
  const inspector = page.getByRole('complementary', { name: 'Plan-Inspektor' });
  const heading = inspector.getByRole('heading', { name: 'Monatsüberblick September 2026', exact: true });
  await expect(heading).toBeVisible();
  const month = inspector.locator('[data-overview-section="month"]');
  const split = inspector.locator('[data-overview-section="split"]');
  const income = inspector.locator('[data-overview-section="income"]');
  const money = inspector.locator('.plan-budget-money');
  const rail = inspector.locator('[data-overview-section="rail"]');
  await expect(month).toHaveAttribute('open', '');
  await expect(split).toHaveAttribute('open', '');
  for (const section of [income, money, rail]) await expect(section).not.toHaveAttribute('open', '');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => { document.documentElement.dataset['theme'] = value; }, theme);
    await expect(inspector.getByText('75 % vorbereitet', { exact: true })).toBeVisible();
    await expect(inspector.getByTestId('next-month-difference')).toHaveText('fehlt 50,00 €');
    await expect(inspector.getByRole('progressbar', { name: 'Zieldeckung nächster Monat' })).toHaveAttribute('value', '15000');
    const amounts = (await inspector.locator('.month-statement dd').allTextContents()).map((text) => Number(text.replace(/[^\d−-]/g, '').replace('−', '-')));
    expect(amounts).toHaveLength(4);
    expect(amounts[0]! + amounts[1]! + amounts[2]!).toBe(amounts[3]);
    if (info.project.name === 'desktop') {
      expect(page.viewportSize()).toEqual({ width: 1440, height: 900 });
      const side = (await inspector.boundingBox())!;
      const grid = (await page.locator('.plan-main').boundingBox())!;
      await info.attach(`default-geometry-${theme}`, { body: JSON.stringify({ side, grid }), contentType: 'application/json' });
      expect(side.y).toBeLessThan(900);
      expect(grid.y).toBeLessThan(900);
      expect(side.height).toBeLessThanOrEqual(grid.height);
    }
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (info.project.name !== 'desktop') {
      for (const control of await inspector.locator('button:visible, summary:visible, a:visible').all()) {
        const box = (await control.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
    await inspector.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`month-overview-public-${theme}.png`), fullPage: false });
    const profile = page.locator('.m-profile summary');
    if (await profile.isVisible()) await profile.click();
    const privacy = page.getByRole('button', { name: 'Beträge verbergen', exact: true });
    await privacy.click();
    if (await profile.isVisible()) await profile.press('Escape');
    await expect(inspector.getByTestId('month-statement-availableCents')).toHaveText('••• €');
    await expect(inspector.getByText('••• % vorbereitet', { exact: true })).toBeVisible();
    await expect(inspector.getByTestId('next-month-difference')).toHaveText('fehlt ••• €');
    await expect(inspector.getByRole('progressbar', { name: 'Zieldeckung nächster Monat' })).toHaveCount(0);
    if (await profile.isVisible()) await profile.click();
    await privacy.click();
    if (await profile.isVisible()) await profile.press('Escape');
    await expect(inspector.getByText('75 % vorbereitet', { exact: true })).toBeVisible();
  }
  await split.locator(':scope > summary').click();
  for (const section of [income, money, rail]) await section.locator(':scope > summary').click();
  await inspector.getByRole('button', { name: 'Monatsüberblick einklappen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('budget.plan.overview') ?? '{}'))).toMatchObject({ collapsed: true, split: false, income: true, money: true, rail: true });
  await page.reload();
  const expand = inspector.getByRole('button', { name: 'Monatsüberblick ausklappen', exact: true });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expand.click();
  await expect(split).not.toHaveAttribute('open', '');
  for (const section of [income, money, rail]) await expect(section).toHaveAttribute('open', '');
  await expect(month).toHaveAttribute('open', '');
  await inspector.getByRole('button', { name: 'Monatsüberblick einklappen', exact: true }).click();
  await page.getByRole('button', { name: /^Unterfinanziert / }).click();
  await expect(inspector.getByRole('button', { name: 'Monatsüberblick einklappen', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(income).toHaveAttribute('open', '');
  await expect(income.locator(':scope > summary')).toBeFocused();
});
