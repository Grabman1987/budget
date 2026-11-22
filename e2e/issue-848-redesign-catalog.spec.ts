import { hubReportCount } from './report-menu';
import AxeBuilder from '@axe-core/playwright';
import { sampleTest as test, expect } from './sample';

const identities = [
  'onepager',
  'jahresreport',
  'kontakte',
  'explorer',
  'vermoegen-schulden',
  'pdepots',
  'pallocation',
  'psteuern',
  'einnahmen-ausgaben',
  'ausgaben',
  'gehalt',
  'geldfluss',
  'sparquote',
  'budgettreue',
  'abos',
  'inflation',
];

test('catalog preserves the sixteen ON destinations, legacy names and usable fallback readers', async ({
  page,
}, info) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    if (info.project.name !== 'desktop') await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/reports');
    await expect(page.locator('.report-hub')).toBeVisible();
    const redesign = (await page.locator('[data-budget-redesign="1"]').count()) > 0;
    await expect(page.locator('.report-hub-v2')).toHaveCount(redesign ? 1 : 0);
    await expect(page.locator('.report-hub-list > li')).toHaveCount(await hubReportCount(page));
    if (!redesign) continue;
    expect(
      await page
        .locator('.report-hub-list > li > a')
        .evaluateAll((links) =>
          links.map((link) => new URL((link as HTMLAnchorElement).href).pathname),
        ),
    ).toEqual(identities.map((id) => `/reports/${id}`));
    const search = page.getByRole('searchbox', {
      name: 'Berichte nach Name oder Frage suchen',
      exact: true,
    });
    for (const [name, id] of [
      ['Finanz-Check-Verlauf', 'onepager'],
      ['Rendite und Kennzahlen', 'pallocation'],
      ['Jahresansicht', 'explorer'],
      ['Gesamttabelle', 'explorer'],
      ['Zeitraumvergleich', 'ausgaben'],
    ]) {
      await search.fill(name!);
      await expect(page.locator('.report-hub-list > li > a')).toHaveAttribute(
        'href',
        `/reports/${id}`,
      );
    }
    await search.fill('Prognosegenauigkeit');
    await expect(page.locator('.report-hub-list > li')).toHaveCount(0);
    await search.fill('');
    await expect(page.locator('.report-hub-moved')).toHaveCount(0);
    for (const id of ['gesamttabelle', 'planungstreue', 'vorschau', 'sparziele', 'liquiditaet'])
      await expect(page.locator(`.report-hub a[href="/reports/${id}"]`)).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Finanz-Check-Verlauf', exact: true }),
    ).toHaveAttribute('href', '/reports/finanzcheck');
    await expect(page.locator('.report-hub-list a[href="/reports/pallocation"]')).toContainText(
      'Portfolio-Auswertung',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`catalog-${theme}.png`), fullPage: true });
  }
});

test('catalog search and legacy report bookmarks retain their destinations and state', async ({
  page,
}, info) => {
  await page.goto('/reports');
  await expect(page.locator('.report-hub')).toBeVisible();
  if ((await page.locator('[data-budget-redesign="1"]').count()) === 0) return;
  await page
    .getByRole('button', {
      name:
        info.project.name === 'desktop' ? 'Suchen: Seiten, Reports, Buchungen, Aktionen' : 'Suchen',
      exact: true,
    })
    .click();
  const palette = page.getByRole('combobox', { name: 'Suchen', exact: true });
  await expect(palette).toBeVisible();
  for (const [term, label] of [
    ['Monats-One-Pager', '1 Monatsbericht'],
    ['Vermögensreport', '5 Vermögensreport'],
    ['Gehaltsreport', '11 Gehalt'],
    ['Liquiditätsprognose', 'Plan · Prognose'],
  ]) {
    await palette.fill(term!);
    await expect(page.getByRole('option', { name: new RegExp(label!) })).toBeVisible();
  }
  await palette.press('Escape');
  for (const [alias, target, view] of [
    ['prendite', 'pallocation', 'rendite'],
    ['cashflow', 'einnahmen-ausgaben', 'cashflow'],
    ['finanzcheck', 'onepager', 'finanzcheck'],
  ]) {
    const hash = alias === 'finanzcheck' ? '#fc-matrix' : '#details';
    await page.goto(
      `/reports/${alias}?monat=2026-08&zeitraum=2026-01..2026-08&period=month${hash}`,
    );
    await expect(page).toHaveURL(new RegExp(`/reports/${target}\\?`));
    const url = new URL(page.url());
    expect(url.searchParams.get('darstellung')).toBe(view);
    expect(url.searchParams.get('monat')).toBe('2026-08');
    expect(url.searchParams.get('zeitraum')).toBe('2026-01..2026-08');
    expect(url.hash).toBe(hash);
    await expect(page.locator('.placeholder')).toHaveCount(0);
    await expect(page.locator('.report-switcher')).toBeVisible();
  }
});
