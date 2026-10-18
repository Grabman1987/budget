import { sampleTest, expect } from './sample';
import type { BudgetMonthView } from '../apps/web/src/budget/budget-api';

for (const scheme of ['light', 'dark'] as const) {
  sampleTest(
    `design scale survives the page cascade in ${scheme}`,
    async ({ page, isMobile }, info) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      // The seeded month is fully assigned. Exercise the positive hero/button with a synthetic
      // read-only response; no booking or shared sample-server state is changed.
      await page.route('**/api/budget/2026-09', async (route) => {
        const response = await route.fetch();
        const body = (await response.json()) as BudgetMonthView;
        body.summary.toBeAssignedCents = 10_000;
        // Keep the synthetic dimension chain cent-exact as well as the hero state.
        body.summary.incomeCents =
          10_000 -
          body.summary.carryInCents +
          body.summary.uncoveredCents +
          body.summary.assignedCents +
          body.summary.heldCents;
        await route.fulfill({ response, json: body });
      });
      await page.goto('/plan/monat?monat=2026-09');
      await expect(page.locator('.plan .plan-topbar')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      // "Zu verteilen" is the lead figure of the Plan head: the DS2 display token (T2).
      await expect(page.getByTestId('to-be-assigned')).toHaveCSS(
        'font-size',
        isMobile ? '24px' : '28px',
      );
      // Plan chips stay compact controls (T7), one step below body text.
      await expect(page.locator('.plan-chip-scroll .plan-chip').first()).toHaveCSS(
        'font-size',
        isMobile ? '15px' : '14px',
      );
      await expect(page.locator('.plan-topbar .plan-chip-scroll > .btn')).toHaveCSS(
        'border-top-left-radius',
        '8px',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
        isMobile ? 390 : 1440,
      );
      await page.screenshot({ path: info.outputPath(`plan-${scheme}.png`), fullPage: true });

      await page.goto('/reports/onepager?monat=2026-09');
      await expect(page.locator('.ps-tb-cell .tech').first()).toBeVisible();
      await expect(page.locator('.ps-tb-cell .tech').first()).toHaveCSS('font-size', '12px');
      await page.screenshot({ path: info.outputPath(`onepager-${scheme}.png`), fullPage: true });

      await page.goto('/dev/bauteile');
      await expect(page.getByTestId('chart-lines')).toBeVisible();
      await expect(page.locator('.svg-label-strong').first()).toHaveCSS('font-size', '14px');
      await expect(page.locator('.sw').first()).toHaveCSS('border-top-left-radius', '1px');
      await expect(page.locator('.seg button').first()).toHaveCSS(
        'font-size',
        isMobile ? '16px' : '15px',
      );
    },
  );
}
