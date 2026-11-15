import type { Page } from '@playwright/test';
import type { BudgetMonthView } from '../apps/web/src/budget/budget-api';
import { expect, sampleTest as test } from './sample';

async function headerPresentation(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  // The phone disclosure can scroll its trigger; compare the sticky head at the same offset.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  return page.locator('.plan-topbar-v2').evaluate((head) =>
    ['.plan-tba', '.plan-reference-income', '.plan-reference-lead-layout'].map((selector) => {
      const element = head.querySelector(selector)!;
      const { x, y, width, height } = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x,
        y,
        width,
        height,
        display: style.display,
        background: style.backgroundColor,
        border: [style.borderTop, style.borderRight, style.borderBottom, style.borderLeft],
        color: style.color,
      };
    }),
  );
}

async function openIncome(page: Page) {
  if (page.viewportSize()!.width >= 1180) {
    await page.locator('.plan-reference-income').getByRole('button', { name: 'Details →' }).click();
  } else {
    await page.locator('.plan-tba').click();
    await page
      .locator('#plan-chip-panel-0')
      .getByRole('button', { name: /Einnahmen/ })
      .click();
  }
  await expect(page).toHaveURL(/\/plan\/monat\/einnahmen\?monat=2026-09/);
  await expect(page.getByTestId('income-received')).toBeVisible();
}

for (const theme of ['light', 'dark'] as const) {
  test(`Plan header survives income detail returns in ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((value) => localStorage.setItem('budget-theme', value), theme);
    // Keep the positive state explicit: it exposed the legacy green box after navigation.
    await page.route(/\/api\/budget\/2026-09(?:\?previewBasis=1)?$/, async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as BudgetMonthView;
      body.summary.toBeAssignedCents = 12345;
      await route.fulfill({ response, json: body });
    });
    await page.goto('/plan/monat?monat=2026-09');
    await expect(page.locator('.app')).toHaveAttribute('data-budget-redesign', '1');
    await expect(page.getByTestId('to-be-assigned')).toHaveText('123,45 €');
    await expect(page.locator('.plan-reference-income')).toBeAttached();
    const before = await headerPresentation(page);
    expect(before[0]!.background).toBe('rgba(0, 0, 0, 0)');
    if (page.viewportSize()!.width >= 1180) {
      const income = before[1]!;
      const layout = before[2]!;
      expect(income.x + income.width).toBeCloseTo(layout.x + layout.width, 1);
    } else {
      expect(before[1]!.display).toBe('none');
    }

    for (const returnPath of ['history', 'link']) {
      await openIncome(page);
      if (returnPath === 'history') await page.goBack();
      else await page.getByRole('link', { name: 'Zurück zum Monat' }).click();
      await expect(page).toHaveURL(/\/plan\/monat\?monat=2026-09/);
      await expect(page.getByTestId('to-be-assigned')).toHaveText('123,45 €');
      await expect(page.locator('.plan-reference-income')).toBeAttached();
      await expect.poll(() => headerPresentation(page)).toEqual(before);
    }
  });
}
