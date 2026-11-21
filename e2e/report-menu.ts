import { expect, type Page } from '@playwright/test';

/** Views that are the report itself (not an indented sub-report): the numbered menu entry of the parent. */
const PARENTS: Record<string, RegExp> = {
  'Einnahmen und Ausgaben': /^\d+\. Einnahmen und Cashflow$/,
  'Gruppen und Kategorien': /^\d+\. Ausgabenanalyse$/,
  'Vermögen und Schulden': /^\d+\. Vermögensreport$/,
  'Gebühren und Steuern': /^\d+\. Kosten und Steuern$/,
  'Verteilung über Zeit': /^\d+\. Portfolio-Auswertung$/,
};
/** Old select labels that now carry the name of the indented menu entry. */
const ALIASES: Record<string, string> = { 'Projekt-Ergebnisse': 'Projekte und Nebeneinkünfte' };

const menuLink = (page: Page, label: string) =>
  page.getByRole('link', {
    name: PARENTS[label] ?? ALIASES[label] ?? label,
    exact: !PARENTS[label],
  });

async function openMenu(page: Page) {
  const summary = page.getByLabel('Bericht wechseln', { exact: true });
  if ((await summary.locator('xpath=..').getAttribute('open')) === null) await summary.click();
}

/** Redesign: views of a report are indented entries of the report menu (#1150). */
export async function chooseReportMenuView(page: Page, label: string) {
  await openMenu(page);
  await menuLink(page, label).click();
}

export async function expectReportMenuView(page: Page, label: string) {
  await openMenu(page);
  await expect(menuLink(page, label)).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
}

const VALUE_LABELS: Record<string, string> = {
  bilanz: 'Vermögen und Schulden',
  verlauf: 'Vermögensverlauf',
  gesamt: 'Gesamtübersicht',
  verteilung: 'Verteilung über Zeit',
  einzahlungen: 'Einzahlungen und Wert',
  rendite: 'Rendite & Risiko',
  kennzahlen: 'Kennzahlen',
  klassen: 'Anlageklassen im Verlauf',
  ertraege: 'Erträge',
  kostenverlauf: 'Kosten im Verlauf',
  gebuehren: 'Gebühren und Steuern',
  bankkosten: 'Bank- und Zinskosten',
};
const labelFor = (page: Page, value: string) =>
  value === 'gesamt' && page.url().includes('/reports/psteuern')
    ? 'Kosten gesamt'
    : (VALUE_LABELS[value] ?? value);

/** Same as the label variants, addressed by the `darstellung` value used in the URL. */
export const chooseReportMenuValue = (page: Page, value: string) =>
  chooseReportMenuView(page, labelFor(page, value));
export const expectReportMenuValue = (page: Page, value: string) =>
  expectReportMenuView(page, labelFor(page, value));

/** Both presentations list sixteen reports. */
export const HUB_REPORT_COUNT = 16;
