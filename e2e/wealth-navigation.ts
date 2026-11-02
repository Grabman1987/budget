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
    await page.getByText('Datenbasis und bestehende Auswertungen', { exact: true }).click();
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
  if (
    (await wealthRedesign(page)) &&
    label === 'Übersicht' &&
    (await page.locator('.wealth-toolbar').count())
  ) {
    await page.getByText('Datenbasis und bestehende Auswertungen', { exact: true }).click();
    await page.getByRole('link', { name: 'Bestehende Portfolioanalyse', exact: true }).click();
  }
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

/** Analysis contracts stay covered at their retained deep link in ON; OFF keeps its original URL. */
export async function gotoWealthAnalysis(page: Page, path: string) {
  await page.goto(path);
  await page.locator('.app').waitFor({ state: 'attached' });
  if (await wealthRedesign(page)) {
    const target = new URL(path, page.url());
    target.searchParams.set('ansicht', 'analyse');
    await page.goto(target.pathname + target.search + target.hash);
  }
}

/** Follow the retained analysis from the new overview after validating an incoming deep link. */
export async function showPortfolioAnalysis(page: Page) {
  if ((await wealthRedesign(page)) && (await page.locator('.wealth-overview').count())) {
    const summary = page.getByText('Datenbasis und bestehende Auswertungen', { exact: true });
    if ((await summary.locator('..').getAttribute('open')) === null) await summary.click();
    await page.getByRole('link', { name: 'Bestehende Portfolioanalyse', exact: true }).click();
  }
}

export async function showDebtCalculation(page: Page) {
  const summary = page.locator('.debt-rechenweg > summary');
  if ((await summary.locator('..').getAttribute('open')) === null) await summary.click();
}

export async function showDebtPlanFacts(page: Page) {
  if (await wealthRedesign(page)) {
    const summary = page.getByText('Modellannahmen, Zins und Tilgung je Jahr', { exact: true });
    if ((await summary.locator('..').getAttribute('open')) === null) await summary.click();
  }
}

export async function showAllocationEvidence(page: Page) {
  if (await wealthRedesign(page)) {
    const summary = page.getByText('Bewertungsbasis, Zuordnung und Rebalancing-Hinweise', {
      exact: true,
    });
    if ((await summary.locator('..').getAttribute('open')) === null) await summary.click();
  }
}
export async function showSavingsSchedules(page: Page) {
  if ((await wealthRedesign(page)) && new URL(page.url()).pathname.endsWith('/sparplaene')) {
    const summary = page.getByText('Zeitpläne, Versionen und beendete Sparpläne', { exact: true });
    if ((await summary.locator('..').getAttribute('open')) === null) await summary.click();
  }
}
export async function showDebtOverview(page: Page) {
  if (await wealthRedesign(page)) {
    const summary = page.getByText('Tilgungsübersicht und weitere Sondertilgungen', {
      exact: true,
    });
    if ((await summary.locator('..').getAttribute('open')) === null) await summary.click();
  }
}

export async function startInvestmentCapture(
  page: Page,
  name: 'Handel erfassen' | 'Wertpapier anlegen',
) {
  if (await wealthRedesign(page)) {
    await page.locator('.wealth-investment > summary').click();
    await page
      .getByRole('navigation', { name: 'Investment hinzufügen' })
      .getByRole('link', { name, exact: true })
      .click();
  } else {
    await page
      .getByRole('button', {
        name: name === 'Wertpapier anlegen' ? 'Instrument anlegen' : name,
        exact: true,
      })
      .first()
      .click();
  }
}
