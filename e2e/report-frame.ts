import { expect, type Page } from '@playwright/test';

/** The build under test decides the presentation; Node's environment is not authoritative. */
export async function redesignReportsOn(page: Page) {
  await expect(page.locator('.app')).toBeVisible();
  return (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
}
export async function revealReportDetail(page: Page) {
  if (await redesignReportsOn(page)) {
    const summary = page.locator('.redesign-report-detail:not([open]) > summary');
    if (await summary.count()) await summary.click();
  }
}
