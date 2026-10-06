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
      await expect(page.locator('.plan .hero-kpi')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('.plan .hero-kpi')).toHaveCSS('border-top-left-radius', '12px');
      await expect(page.locator('.plan .hero-fig')).toHaveCSS(
        'font-size',
        isMobile ? '40px' : '44px',
      );
      await expect(page.locator('.plan .hero-state')).toHaveCSS(
        'font-size',
        isMobile ? '15px' : '14px',
      );
      await expect(page.locator('.plan .btn-on-hero')).toHaveCSS('border-top-left-radius', '8px');
      await expect(page.locator('.plan .sb-legend').first()).toHaveCSS('font-size', '12px');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
        isMobile ? 390 : 1440,
      );
      await page.screenshot({ path: info.outputPath(`plan-${scheme}.png`), fullPage: true });

      await page.goto('/reports/onepager?monat=2026-09');
      await expect(page.locator('.ps-tb-cell .tech').first()).toBeVisible();
      await expect(page.locator('.ps-tb-cell .tech').first()).toHaveCSS('font-size', '11px');
      await page.screenshot({ path: info.outputPath(`onepager-${scheme}.png`), fullPage: true });

      await page.goto('/dev/bauteile');
      await expect(page.getByTestId('chart-lines')).toBeVisible();
      await expect(page.locator('.svg-label-strong').first()).toHaveCSS('font-size', '13px');
      await expect(page.locator('.sw').first()).toHaveCSS('border-top-left-radius', '1px');
      await expect(page.locator('.seg button').first()).toHaveCSS(
        'font-size',
        isMobile ? '15px' : '14px',
      );
    },
  );
}
