import type { Page } from '@playwright/test';

export async function wealthRedesign(page: Page) {
  return (await page.locator('.app').getAttribute('data-budget-redesign')) === '1';
}

/** The five-page menu replaces portfolio tabs only in migrated ON bodies. */
export async function portfolioNavigation(page: Page) {
  const toolbar = page.locator('.wealth-toolbar');
  if ((await wealthRedesign(page)) && (await toolbar.count())) {
    const menu = toolbar.locator('.area-page-menu').first();
    if ((await menu.getAttribute('open')) === null) await menu.locator('summary').click();
    return menu.getByRole('navigation', { name: 'Ansichten von Vermögen', exact: true });
  }
  return page.getByRole('navigation', { name: 'Portfolio-Register', exact: true });
}

export async function selectPortfolioView(page: Page, label: string) {
  if (
    (await wealthRedesign(page)) &&
    (await page.locator('.wealth-toolbar').count()) &&
    ['Kennzahlen', 'Übersicht'].includes(label)
  ) {
    const nav = await portfolioNavigation(page);
    await nav.getByRole('link', { name: 'Übersicht', exact: true }).click();
    await page
      .getByRole('link', {
        name:
          label === 'Kennzahlen'
            ? 'Bestehende Portfolio-Kennzahlen'
            : 'Bestehende Portfolioanalyse',
        exact: true,
      })
      .click();
    return;
  }
  await (await portfolioNavigation(page)).getByRole('link', { name: label, exact: true }).click();
}

export async function showDebtHistory(page: Page) {
  if (await wealthRedesign(page)) {
    const summary = page.getByText('Schuldenverlauf · letzte 12 Monate', { exact: true });
    if ((await summary.count()) && (await summary.locator('..').getAttribute('open')) === null)
      await summary.click();
  }
}

export async function wealthAreaNavigation(page: Page) {
  if (await wealthRedesign(page)) {
    const menu = page.locator('main .area-page-menu').first();
    if ((await menu.getAttribute('open')) === null) await menu.locator('summary').click();
    return menu.getByRole('navigation', { name: 'Ansichten von Vermögen', exact: true });
  }
  return page.getByRole('navigation', { name: 'Register von Vermögen', exact: true });
}
