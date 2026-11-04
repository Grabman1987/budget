import { expect, type Page } from '@playwright/test';
import { redesignReportsOn } from './report-frame';

/** Existing financial tests exercise the complete editor/table in either presentation. */
export async function retainExplorerReaders(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('budget-report-r8-explorer-editor', '1');
    localStorage.setItem('budget.report-explorer.full-table', '1');
  });
}
export async function openCustomExplorer(page: Page) {
  await retainExplorerReaders(page);
  await page.goto('/reports/explorer');
  if (await redesignReportsOn(page))
    await page
      .getByRole('combobox', { name: 'Darstellung der Auswertung', exact: true })
      .selectOption('custom');
  await expect(page.getByLabel('Zeilen', { exact: true })).toBeVisible();
}
export async function selectExplorerPeriod(page: Page, value: string) {
  if (await redesignReportsOn(page))
    await page
      .getByRole('group', { name: 'Zeitraum', exact: true })
      .getByRole('button', { name: value, exact: true })
      .click();
  else await page.getByLabel('Zeitraum', { exact: true }).selectOption(value);
}
