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

export async function openPaperView(page: Page) {
  if (await redesignReportsOn(page)) {
    const select = page.getByRole('combobox', { name: 'Darstellung', exact: true });
    if (!(await select.count()))
      await page
        .getByRole('button', { name: 'A4 Druckblatt und alle Details öffnen', exact: true })
        .click();
    else await select.selectOption('druckblatt');
    await expect(select).toHaveValue('druckblatt');
  }
}
export async function revealComparisonDetail(page: Page) {
  if (await redesignReportsOn(page)) {
    const panel = page.locator('.period-comparison-detail');
    await expect(panel).toBeVisible();
    if ((await panel.getAttribute('open')) === null) await panel.locator('summary').click();
  }
}
