import { expect, type Page } from '@playwright/test';
import { redesignReportsOn } from './report-frame';

export async function chooseReportView(page: Page, label: string, view: string) {
  if (await redesignReportsOn(page)) {
    const select = page.getByRole('combobox', { name: label, exact: true });
    await select.focus();
    await select.selectOption({ label: view });
    await expect(select).toBeFocused();
  } else
    await page
      .getByRole('group', { name: label, exact: true })
      .getByRole('button', { name: view, exact: true })
      .click();
}
export async function openIncomeTable(page: Page) {
  if (!(await redesignReportsOn(page))) return;
  const detail = page.locator('.r8-income-details');
  await expect(detail).toBeVisible();
  if ((await detail.getAttribute('open')) === null) await detail.locator('summary').click();
}

export async function openSpendingGroups(page: Page) {
  if (!(await redesignReportsOn(page))) return;
  const section = page.locator('section[aria-labelledby="sa-main"]');
  await expect(section).toBeVisible();
  if ((await section.getAttribute('data-collapsed')) === 'true')
    await section.locator('.section-toggle').click();
  const all = section.getByRole('button', { name: /^Alle \d+ Gruppen anzeigen$/ });
  if (await all.count()) await all.click();
  const answer = page.locator('[data-r8-detail="spending-answer"]');
  if ((await answer.getAttribute('open')) === null) await answer.locator('summary').click();
}
export async function openR8BodyDetails(page: Page) {
  if (!(await redesignReportsOn(page))) return;
  await expect(page.locator('[data-r8-detail]').first()).toBeVisible();
  for (const detail of await page.locator('[data-r8-detail]').all()) {
    if ((await detail.getAttribute('open')) === null)
      await detail.locator(':scope > summary').click();
  }
}
