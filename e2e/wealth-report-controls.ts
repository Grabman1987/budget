import { expect, type Page } from '@playwright/test';
import { redesignReportsOn } from './report-frame';
import { chooseReportMenuView, expectReportMenuView } from './report-menu';

export async function portfolioReportPath(page: Page) {
  // The portfolio views live in their own report in both modes (#1157).
  return page ? '/reports/pallocation' : '';
}
export async function selectWealthReportView(page: Page, label: string) {
  if (await redesignReportsOn(page)) await chooseReportMenuView(page, label);
  else await page.getByRole('button', { name: label, exact: true }).click();
}
export async function expectWealthReportView(page: Page, label: string) {
  if (await redesignReportsOn(page)) await expectReportMenuView(page, label);
  else
    await expect(
      page.getByRole('button', { name: label, exact: true, pressed: true }),
    ).toBeVisible();
}
