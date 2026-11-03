import { expect, type Page } from '@playwright/test';
import { redesignReportsOn } from './report-frame';

const values: Record<string, string> = {
  'Vermögen und Schulden': 'bilanz',
  Vermögensverlauf: 'verlauf',
  Gesamtübersicht: 'gesamt',
  'Verteilung über Zeit': 'verteilung',
  'Einzahlungen und Wert': 'einzahlungen',
  'Rendite & Risiko': 'rendite',
};
export async function portfolioReportPath(page: Page) {
  return (await redesignReportsOn(page)) ? '/reports/vermoegen-schulden' : '/reports/pallocation';
}
export async function selectWealthReportView(page: Page, label: string) {
  if (await redesignReportsOn(page))
    await page
      .getByRole('combobox', { name: 'Darstellung des Vermögensreports' })
      .selectOption(values[label]!);
  else await page.getByRole('button', { name: label, exact: true }).click();
}
export async function expectWealthReportView(page: Page, label: string) {
  if (await redesignReportsOn(page))
    await expect(
      page
        .getByRole('combobox', { name: 'Darstellung des Vermögensreports' })
        .locator('option:checked'),
    ).toHaveText(label);
  else
    await expect(
      page.getByRole('button', { name: label, exact: true, pressed: true }),
    ).toBeVisible();
}
